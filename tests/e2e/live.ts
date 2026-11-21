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
  verify?: string;
  /** Alternative à verify : une mesure numérique qui doit croître d'au moins `grow` (ex. 1.15 = +15 %). */
  measure?: string;
  grow?: number;
  /** Contrôle de mise en page supplémentaire (true = OK), évalué après l'effet. */
  layout?: string;
  /** Nombre de changements séparés attendus (une règle chacun, activables un par un). */
  changes?: number;
  /** Chaque règle créée ne porte que le prompt qui l'a produite (pas « x → y »). */
  soloPrompts?: boolean;
}

/** Cartes vidéo YouTube : la miniature ne chevauche pas le titre, et le titre reste lisible. */
const YT_LAYOUT_OK = `(() => {
  const cards = [...document.querySelectorAll('ytd-video-renderer, yt-lockup-view-model')]
    .filter((c) => c.getBoundingClientRect().top < innerHeight * 2 && c.getBoundingClientRect().width > 0)
    .slice(0, 6);
  const problems = [];
  for (const card of cards) {
    const thumb = card.querySelector('ytd-thumbnail, yt-thumbnail-view-model');
    const title = card.querySelector('#video-title, h3, [class*="Title"]');
    if (!thumb || !title) continue;
    const a = thumb.getBoundingClientRect(), b = title.getBoundingClientRect();
    const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    if (overlap > 0.1 * b.width * b.height) problems.push('chevauchement');
    if (b.width < 120) problems.push('titre écrasé (' + Math.round(b.width) + 'px)');
  }
  return problems.length ? problems.join(', ') : true;
})()`;

/** Largeur médiane des miniatures visibles (img de plus de 100 px de large). */
const THUMB_WIDTH = `(() => {
  const widths = [...document.querySelectorAll('ytd-thumbnail img, yt-thumbnail-view-model img, ytd-thumbnail, yt-thumbnail-view-model')]
    .map((e) => e.getBoundingClientRect().width).filter((w) => w > 60).sort((a, b) => a - b);
  return widths[widths.length >> 1] ?? 0;
})()`;

const SCENARIOS: Scenario[] = [
  {
    name: 'youtube-search-images',
    url: 'https://www.youtube.com/results?search_query=lofi+music',
    prompts: ['Modifie-moi les images plus grosses'],
    measure: THUMB_WIDTH,
    grow: 1.1,
    layout: YT_LAYOUT_OK,
  },
  {
    name: 'youtube-watch-images',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    prompts: ['Modifie-moi les images plus grosses'],
    measure: THUMB_WIDTH,
    grow: 1.15,
    layout: YT_LAYOUT_OK,
  },
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
    name: 'wiki-multi',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    prompts: [
      "Cache la table des matières, mets le titre principal en rouge et agrandis le texte de l'article",
    ],
    changes: 3,
    verify: `(() => {
      const [r, g, b] = getComputedStyle(document.querySelector('#firstHeading')).color.match(/\\d+/g).map(Number);
      const p = document.querySelector('.mw-parser-output p:not(.mw-empty-elt)');
      return !document.querySelector('#mw-panel-toc')?.checkVisibility() && r > 150 && g < 100 && b < 100 && parseFloat(getComputedStyle(p).fontSize) >= 17;
    })()`,
  },
  {
    name: 'wiki-two-commands',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    prompts: ['Mets le titre principal en rouge', 'Cache la table des matières'],
    changes: 2,
    soloPrompts: true,
    verify: `!document.querySelector('#mw-panel-toc')?.checkVisibility()`,
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
    const before = s.measure ? Number(await page.evaluate(s.measure)) : 0;
    const startedAt = new Date().toISOString();
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
    {
      const titles = await panel
        .getByTestId('draft-changes')
        .locator('label')
        .allTextContents()
        .catch(() => []);
      console.log(
        `    changements : ${titles.map((t) => `« ${t} »`).join(', ') || 'aucune liste'}`,
      );
      if (s.changes && titles.length !== s.changes) {
        throw new Error(`${titles.length} changement(s) au lieu de ${s.changes}`);
      }
    }
    await page.screenshot({ path: `${out}/${s.name}-preview.png` });
    const css = await page.evaluate(() => document.getElementById('bp-preview')?.textContent ?? '');
    const check = async (): Promise<boolean> => {
      if (s.layout) {
        const layout = await page.evaluate(s.layout);
        if (layout !== true) {
          console.log(`    mise en page : ${layout}`);
          return false;
        }
      }
      if (s.verify) return Boolean(await page.evaluate(s.verify));
      const after = Number(await page.evaluate(s.measure!));
      console.log(`    mesure : ${Math.round(before)} → ${Math.round(after)}`);
      return after >= before * (s.grow ?? 1.1);
    };
    const previewOk = await check();
    await panel.getByRole('button', { name: 'Garder' }).click();
    await panel.getByTestId('rules').waitFor({ timeout: 5000 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(800);
    let replayOk = await check();
    if (s.changes) {
      const host = new URL(s.url).hostname;
      const created = await worker.evaluate(
        async ([h, since]) =>
          (
            (await chrome.storage.local.get(`rules:${h}`))[`rules:${h}`] as {
              rules: { prompt: string; title?: string; createdAt: string }[];
            }
          ).rules
            .filter((r) => r.createdAt >= since)
            .map((r) => ({ label: r.title ?? r.prompt, prompt: r.prompt })),
        [host, startedAt] as const,
      );
      console.log(
        `    règles enregistrées : ${created.map((r) => `« ${r.label} » (prompt : ${r.prompt})`).join(', ')}`,
      );
      const rows = created.length;
      if (s.soloPrompts && !created.every((r) => s.prompts.includes(r.prompt))) {
        console.log('    une règle porte le prompt d’un autre changement');
        replayOk = false;
      }
      if (rows !== s.changes) replayOk = false;
    }
    if (!replayOk) {
      const debug = await page.evaluate(() => ({
        styles: document.getElementById('bp-styles')?.textContent?.length ?? -1,
        sample: document.getElementById('bp-styles')?.textContent?.slice(0, 600),
        path: location.pathname,
        cards: [
          ...new Set(
            [...document.querySelectorAll('ytd-video-renderer, yt-lockup-view-model')].map(
              (e) => e.tagName,
            ),
          ),
        ],
      }));
      console.log(`    debug rejeu : ${JSON.stringify(debug)}`);
    }
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
