// Contrôle manuel (réseau requis) des sites de démo, sans LLM : on vérifie que la distillation
// expose les régions clés, puis on applique la recette qu'un LLM renverrait (preview → Keep → reload).
// Usage : node tests/e2e/demo-sites.ts
import { launch } from './harness.ts';

interface Scenario {
  name: string;
  url: string;
  /** Motif de la ligne de région que le LLM devrait choisir. */
  region: RegExp;
  op: 'hide' | 'style';
  css?: Record<string, string>;
  /** Vérification visuelle après application, exécutée dans la page. */
  verify: string;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'Wikipedia : cacher la table des matières',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    region: /aria-label="Contents"/,
    op: 'hide',
    verify: `!document.querySelector('#mw-panel-toc')?.checkVisibility()`,
  },
  {
    name: 'Wikipedia : cacher l’infobox',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    region: /<table [^>]*class="infobox"/,
    op: 'hide',
    verify: `!document.querySelector('.infobox')?.checkVisibility()`,
  },
  {
    name: 'Hacker News : fond sombre sur le tableau principal',
    url: 'https://news.ycombinator.com/',
    region: /<table id="hnmain"/,
    op: 'style',
    css: { 'background-color': 'rgb(17, 17, 17)' },
    verify: `getComputedStyle(document.querySelector('#hnmain')).backgroundColor === 'rgb(17, 17, 17)'`,
  },
  {
    name: 'GitHub : cacher la colonne « About »',
    url: 'https://github.com/microsoft/TypeScript',
    region: /rect=\(0\.7\d,[^)]*\) kids=\d+ text="About/,
    op: 'hide',
    verify: `![...document.querySelectorAll('h2')].find((h) => h.textContent.trim() === 'About')?.checkVisibility()`,
  },
];

const { context, extensionId } = await launch();
const panel = await context.newPage();
await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html`);
let failures = 0;

for (const s of SCENARIOS) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  try {
    await page.goto(s.url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(800);
    const tabId = await panel.evaluate(
      async (u) => (await chrome.tabs.query({ url: u.split('?')[0] + '*' }))[0]!.id!,
      s.url,
    );
    const send = (type: string, payload: unknown) =>
      panel.evaluate(
        ([id, t, p]) => chrome.tabs.sendMessage(id as number, { type: t, payload: p }),
        [tabId, type, payload] as const,
      );

    const distilled = (await send('distill', { include: [], focus: null })).data;
    const line = (distilled.regions as string).split('\n').find((l: string) => s.region.test(l));
    if (!line)
      throw new Error(`région introuvable dans la distillation (${distilled.regionCount} régions)`);
    const regionIndex = Number(line.match(/\[#(\d+)\]/)![1]);
    const recipe = {
      changes: [
        {
          title: s.name,
          ops: [{ op: s.op, target: 't1', ...(s.css ? { css: s.css } : {}) }],
          targets: { t1: { regionIndex, selectorHints: [] } },
          css: '',
        },
      ],
      explanation: s.name,
    };
    const draft = (await send('preparePreview', { recipe, prompts: [s.name] })).data;
    if (!(await page.evaluate(s.verify))) throw new Error('preview sans effet visible');
    const keep = await panel.evaluate(
      ([id, d]) => chrome.runtime.sendMessage({ type: 'keep', payload: { tabId: id, draft: d } }),
      [tabId, draft] as const,
    );
    if (!keep.ok) throw new Error(`keep : ${keep.error}`);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(800);
    if (!(await page.evaluate(s.verify))) throw new Error('non rejoué après reload');
    console.log(
      `  ✓ ${s.name}\n      région [#${regionIndex}] → ${draft.changes[0].targets.t1.selectors.join(' | ')}`,
    );
  } catch (error) {
    failures++;
    console.log(`  ✗ ${s.name}\n      ${error instanceof Error ? error.message : error}`);
  }
  await page.close();
}
await context.close();
process.exit(failures ? 1 : 0);
