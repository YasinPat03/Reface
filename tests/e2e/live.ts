// Test « live » avec un vrai LLM : pilote la vraie UI du panel sur de vrais sites,
// mesure la latence, vérifie l'effet visible et sauvegarde des captures.
// Config dans .env.local (non commité) :
//   BP_API_KEY=...   BP_BASE_URL=https://api.openai.com/v1   BP_MODEL=gpt-4o-mini
// Usage : npm run build && node tests/e2e/live.ts [filtre]
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launch } from './harness.ts';

const env = Object.fromEntries(
  (
    (await readFile(resolve(import.meta.dirname, '../../.env.local'), 'utf8').catch(() => null)) ??
    (await readFile(resolve(import.meta.dirname, '../../env.local'), 'utf8').catch(() => ''))
  )
    .split('\n')
    .map((line) => line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => [m[1], m[2]!.replace(/^["']|["']$/g, '')]),
);
const settings = {
  apiKey: env.BP_API_KEY ?? '',
  baseUrl: env.BP_BASE_URL ?? 'https://api.openai.com/v1',
  model: env.BP_MODEL ?? 'gpt-4o-mini',
};
if (!settings.apiKey) {
  console.error('BP_API_KEY manquant dans .env.local');
  process.exit(2);
}

interface Scenario {
  name: string;
  url: string;
  prompts: string[];
  /** Expression évaluée dans la page : true si l'effet attendu est visible. */
  verify: string;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'wiki-toc',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    prompts: ['Cache la table des matières'],
    verify: `!document.querySelector('#mw-panel-toc')?.checkVisibility()`,
  },
  {
    name: 'wiki-text',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    prompts: ["Agrandis le texte de l'article"],
    verify: `parseFloat(getComputedStyle(document.querySelector('.mw-parser-output p:not(.mw-empty-elt)')).fontSize) >= 17`,
  },
  {
    name: 'wiki-heading-color',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    prompts: ['Mets le titre principal en rouge'],
    verify: `(() => { const [r, g, b] = getComputedStyle(document.querySelector('#firstHeading')).color.match(/\\d+/g).map(Number); return r > 150 && g < 100 && b < 100; })()`,
  },
  {
    name: 'hn-dark',
    url: 'https://news.ycombinator.com/',
    prompts: ['Mode sombre', 'un peu moins contrasté'],
    verify: `(() => { const bg = getComputedStyle(document.querySelector('#hnmain') ?? document.body).backgroundColor; const n = bg.match(/\\d+/g)?.map(Number) ?? [255,255,255]; return n.slice(0,3).reduce((a, b) => a + b, 0) < 300; })()`,
  },
  {
    name: 'github-about',
    url: 'https://github.com/microsoft/TypeScript',
    prompts: ['Cache la colonne About à droite'],
    verify: `![...document.querySelectorAll('h2')].find((h) => h.textContent.trim() === 'About')?.checkVisibility()`,
  },
];

const filter = process.argv[2];
const out = resolve(import.meta.dirname, '../../.live-shots');
await mkdir(out, { recursive: true });
const { context, worker, extensionId } = await launch();
await worker.evaluate((s) => chrome.storage.local.set({ settings: s }), settings);
console.log(`Modèle : ${settings.model} @ ${settings.baseUrl}\n`);

let failures = 0;
for (const s of SCENARIOS.filter((x) => !filter || x.name.includes(filter))) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 400, height: 800 });
  try {
    await page.goto(s.url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1000);
    const tabId = await worker.evaluate(
      async (u) => (await chrome.tabs.query({ url: u.split('?')[0] + '*' })).at(-1)!.id!,
      s.url,
    );
    await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html?tabId=${tabId}`);
    for (const [i, prompt] of s.prompts.entries()) {
      await panel
        .getByLabel(i === 0 ? 'Que voulez-vous changer ?' : 'Affiner la modification')
        .fill(prompt);
      const t0 = Date.now();
      await panel.getByRole('button', { name: i === 0 ? 'Prévisualiser' : 'Réviser' }).click();
      // Attendre la vraie fin de la génération (le brouillon précédent est déjà affiché en itération).
      await panel
        .getByRole('button', { name: 'Génération…' })
        .waitFor({ timeout: 2000 })
        .catch(() => null);
      await panel
        .getByRole('button', { name: 'Génération…' })
        .waitFor({ state: 'detached', timeout: 60_000 });
      const outcome = (await panel.getByRole('alert').count()) ? 'error' : 'draft';
      const ms = Date.now() - t0;
      if (outcome === 'error')
        throw new Error(`erreur après ${ms} ms : ${await panel.getByRole('alert').textContent()}`);
      const explanation = await panel.getByTestId('draft').locator('p').nth(1).textContent();
      const warnings = await panel
        .getByTestId('draft')
        .locator('p', { hasText: '⚠️' })
        .allTextContents();
      console.log(
        `  « ${prompt} » → ${ms} ms · ${explanation}${warnings.length ? ` · ${warnings.join(' ')}` : ''}`,
      );
    }
    await page.screenshot({ path: `${out}/${s.name}-preview.png` });
    const css = await page.evaluate(() => document.getElementById('bp-preview')?.textContent ?? '');
    const previewOk = await page.evaluate(s.verify);
    await panel.getByRole('button', { name: 'Garder' }).click();
    await panel.getByTestId('rules').waitFor({ timeout: 5000 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(800);
    const replayOk = await page.evaluate(s.verify);
    await page.screenshot({ path: `${out}/${s.name}-reload.png` });
    if (!previewOk || !replayOk) {
      failures++;
      console.log(
        `✗ ${s.name} : effet ${previewOk ? 'ok' : 'ABSENT'} en preview, ${replayOk ? 'ok' : 'ABSENT'} après reload\n    CSS : ${css.slice(0, 400)}`,
      );
    } else {
      console.log(`✓ ${s.name}\n    CSS : ${css.slice(0, 200)}`);
    }
  } catch (error) {
    failures++;
    console.log(`✗ ${s.name} : ${error instanceof Error ? error.message.split('\n')[0] : error}`);
  }
  await page.close();
  await panel.close();
}
await context.close();
console.log(
  failures ? `\n${failures} échec(s). Captures : ${out}` : `\nTout est vert. Captures : ${out}`,
);
process.exit(failures ? 1 : 0);
