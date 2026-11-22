// Contrôle manuel (réseau requis, sans LLM) : coût de la distillation et de la preview sur de
// vraies pages, plus long gel de frame pendant chaque appel, problèmes mesurés par les garde-fous.
// Recettes fixes : on mesure l'extension, pas la variabilité du modèle.
// Usage : node tests/e2e/jank.ts [filtre]   (captures dans .live-shots/jank-*.png)
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launch } from './harness.ts';

const DARK = {
  inspiredBy: 'Linear',
  palette: {
    background: '#0f1115',
    surface: '#171a21',
    text: '#e6e8ee',
    muted: '#9aa3b2',
    accent: '#7c9cff',
    header: '#12151b',
    onHeader: '#e6e8ee',
    border: '#262b36',
  },
  typography: { fontFamily: 'system-ui, sans-serif', baseSize: 15, scale: 1.3, titleWeight: 600 },
  shape: { radius: 10, shadow: '0 1px 3px rgba(0,0,0,.3)' },
  layout: {
    cards: true,
    density: 'comfortable',
    maxWidth: 0,
    dividers: false,
    columns: 1,
    cardShape: 'auto',
  },
  roleStyles: [],
};
const change = (title: string, extra: Record<string, unknown>) => ({
  title,
  ops: [],
  targets: {},
  css: '',
  ...extra,
});
const GRID = { ...DARK, layout: { ...DARK.layout, columns: 3 } };

const CASES: { name: string; url: string; recipes: Record<string, unknown[]> }[] = [
  {
    name: 'youtube-results',
    url: 'https://www.youtube.com/results?search_query=lofi+music',
    recipes: {
      'cards-3-columns': [change('Cards', { theme: GRID })],
      'dark-theme': [change('Dark', { theme: DARK })],
      'hide-shorts': [
        change('Hide shorts', {
          css: 'grid-shelf-view-model, ytd-reel-shelf-renderer{display:none}',
        }),
      ],
    },
  },
  {
    name: 'youtube-watch',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    recipes: { 'dark-theme': [change('Dark', { theme: DARK })] },
  },
  {
    name: 'wikipedia',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    recipes: {
      navbar: [change('Navbar', { menuBar: 1 })],
      'dark-theme': [change('Dark', { theme: DARK })],
    },
  },
];

const filter = process.argv[2];
const out = resolve(import.meta.dirname, '../../.live-shots');
await mkdir(out, { recursive: true });
const { context, extensionId } = await launch();
const panel = await context.newPage();
await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html`);

const send = (url: string, type: string, payload: unknown) =>
  panel.evaluate(
    async ([u, t, p]) => {
      const tab = (await chrome.tabs.query({})).find((x) => x.url?.startsWith(u as string));
      const t0 = performance.now();
      const reply = (await chrome.tabs.sendMessage(tab!.id!, { type: t, payload: p })) as {
        ok: boolean;
        data?: Record<string, unknown>;
        error?: string;
      };
      return { ms: Math.round(performance.now() - t0), reply };
    },
    [url, type, payload] as const,
  );

for (const c of CASES.filter((x) => !filter || x.name.includes(filter))) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(c.url, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForTimeout(4000);
  // Plus long intervalle entre deux frames : un appel synchrone de 400 ms gèle la page 400 ms.
  await page.evaluate(() => {
    const w = window as unknown as { __gap: number };
    w.__gap = 0;
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      w.__gap = Math.max(w.__gap, now - last);
      last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const gap = () =>
    page.evaluate(() => {
      const w = window as unknown as { __gap: number };
      const g = Math.round(w.__gap);
      w.__gap = 0;
      return g;
    });
  await page.waitForTimeout(300);
  await gap();
  const dom = await page.evaluate(() => document.querySelectorAll('*').length);
  const distill = await send(c.url, 'distill', { include: [] });
  console.log(
    `\n${c.name} (${dom} éléments)\n  distill : ${distill.ms} ms, gel ${await gap()} ms, ${String(distill.reply.data?.regionCount)} régions`,
  );
  for (const [name, changes] of Object.entries(c.recipes)) {
    await gap();
    const r = await send(c.url, 'preparePreview', {
      recipe: { changes, explanation: '' },
      prompts: [name],
    });
    const frozen = await gap();
    if (!r.reply.ok) {
      console.log(`  ${name} : ERREUR ${r.reply.error}`);
      continue;
    }
    const d = r.reply.data as { warnings: string[]; layoutIssues: string[]; broken: string[] };
    const problems = [...d.warnings, ...d.layoutIssues].map((p) => p.slice(0, 110));
    console.log(
      `  ${name} : ${r.ms} ms, gel ${frozen} ms${d.broken?.length ? `, REFUSÉ (${d.broken.join(', ')})` : ''}${problems.length ? `\n    - ${problems.join('\n    - ')}` : ''}`,
    );
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/jank-${c.name}-${name}.png` });
    await send(c.url, 'clearPreview', {});
  }
  await page.close();
}
await context.close();
console.log(`\nCaptures : ${out}`);
