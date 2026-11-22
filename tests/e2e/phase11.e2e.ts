// Phase 11 : thème par jetons. Le LLM conçoit le goût (jetons), l'extension l'applique aux rôles
// de la page avec hiérarchie, contraste et cohérence garantis, puis le rejeu le restitue tel quel.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { UNKNOWN_PAGE } from './fixtures/unknownForum.ts';
import { assert, check, done, launch, startServer } from './harness.ts';

/** Thème volontairement défaillant : gris illisible, titre plus petit que la base, barre pâle. */
const THEME = {
  inspiredBy: 'Stripe',
  palette: {
    background: '#f6f9fc',
    surface: '#ffffff',
    text: '#0a2540',
    muted: '#d0d0d0',
    accent: '#6159fa',
    header: '#3b82f6',
    onHeader: '#93c5fd',
    border: '#e3e8ee',
  },
  typography: { fontFamily: 'Inter', baseSize: 14, scale: 0.8, titleWeight: 600 },
  shape: { radius: 10, shadow: '0 2px 5px rgba(50,50,93,.1)' },
  layout: {
    cards: true,
    density: 'comfortable',
    maxWidth: 0,
    dividers: false,
    columns: 1,
    cardShape: 'auto',
  },
  roleStyles: [
    {
      role: 'title',
      declarations: [
        { property: 'letter-spacing', value: '-0.01em' },
        { property: 'color', value: '#ff00ff' },
      ],
    },
  ],
};

const requests: string[] = [];

/** Recette selon la demande : thème (défaut), grille par jetons, ou grille écrite à la main. */
function recipeFor(request: string) {
  if (request.includes('grille thème')) {
    return {
      changes: [
        {
          title: 'Grille de cartes',
          ops: [],
          targets: [],
          css: '',
          theme: { ...THEME, layout: { ...THEME.layout, columns: 3, cardShape: 'square' } },
        },
      ],
      explanation: '3 cartes carrées par rangée.',
    };
  }
  if (request.includes('grille à la main')) {
    // Ce que le LLM a écrit sur HN : une grille sur le tbody, qui sépare titre et métadonnées.
    return {
      changes: [
        {
          title: 'Grille',
          ops: [],
          targets: [],
          css: 'td > table > tbody{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px} tr.qx-entry{aspect-ratio:1/1}',
          theme: null,
        },
      ],
      explanation: 'Grille.',
    };
  }
  return {
    changes: [{ title: 'Style Stripe', ops: [], targets: [], css: '', theme: THEME }],
    explanation: 'Un style inspiré de Stripe.',
  };
}

async function llm(req: IncomingMessage, res: ServerResponse) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const messages = (JSON.parse(raw) as { messages: { content: string }[] }).messages;
  const user = messages[1]!.content;
  requests.push(messages.at(-1)!.content);
  const recipe = recipeFor(user.match(/^User request: (.*)$/m)?.[1] ?? '');
  res
    .writeHead(200, { 'Content-Type': 'application/json' })
    .end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(recipe) } }] }));
}

const { server, origin } = await startServer({
  '/': UNKNOWN_PAGE,
  '/v1/chat/completions': (res) => void llm(res.req, res),
});
const { context, worker, extensionId } = await launch();
await worker.evaluate(
  (baseUrl) =>
    chrome.storage.local.set({ settings: { apiKey: 'sk-test', baseUrl, model: 'mock' } }),
  `${origin}/v1`,
);
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(origin);
const tabId = await worker.evaluate(
  async (url) => (await chrome.tabs.query({ url: url + '/*' }))[0]!.id!,
  origin,
);
const panel = await context.newPage();
await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html?tabId=${tabId}`);

/** Mesures du rendu : cohérence des 24 sujets, hiérarchie, contraste. */
const measure = () =>
  page.evaluate(() => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const bgOf = (e: Element | null): number[] => {
      for (; e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return rgb(c);
      }
      return [255, 255, 255];
    };
    const ratio = (e: Element) => {
      const [a, b] = [lum(rgb(getComputedStyle(e).color)), lum(bgOf(e))];
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const titles = [...document.querySelectorAll('.qx-head > a')];
    const metas = [...document.querySelectorAll('td.qx-info')];
    const cells = [...document.querySelectorAll('tr.qx-entry > td')];
    const header = document.querySelector('[bgcolor]')!;
    return {
      titleStyles: new Set(
        titles.map((t) => `${getComputedStyle(t).fontSize}|${getComputedStyle(t).color}`),
      ).size,
      metaStyles: new Set(
        metas.map((m) => `${getComputedStyle(m).fontSize}|${getComputedStyle(m).color}`),
      ).size,
      cardCells: cells.filter((c) => getComputedStyle(c).backgroundColor === 'rgb(255, 255, 255)')
        .length,
      cellCount: cells.length,
      titleSize: parseFloat(getComputedStyle(titles[0]!).fontSize),
      metaSize: parseFloat(getComputedStyle(metas[0]!).fontSize),
      titleColor: getComputedStyle(titles[0]!).color,
      titleSpacing: getComputedStyle(titles[0]!).letterSpacing,
      metaRatio: Math.min(...metas.slice(0, 5).map(ratio)),
      headerLinkRatio: Math.min(...[...header.querySelectorAll('a, b')].map(ratio)),
      pageBg: getComputedStyle(document.body).backgroundColor,
      radius: getComputedStyle(cells[0]!).borderTopLeftRadius,
    };
  });

console.log('Phase 11 : thème par jetons');
let draft: unknown = null;

await check('le thème est appliqué de façon cohérente à tous les sujets', async () => {
  const reply = (await panel.evaluate((m) => chrome.runtime.sendMessage(m), {
    type: 'generate',
    payload: { tabId, prompt: 'rends le site beau façon Stripe', previous: null, pick: null },
  })) as { ok: boolean; data?: { warnings: string[] }; error?: string };
  assert(reply.ok, `generate : ${reply.error}`);
  draft = reply.data;
  const m = await measure();
  assert(m.pageBg === 'rgb(246, 249, 252)', `fond de page ${m.pageBg}`);
  assert(
    m.cardCells === m.cellCount && m.cellCount === 48,
    `${m.cardCells}/${m.cellCount} cellules en carte`,
  );
  assert(m.radius === '10px', `rayon ${m.radius}`);
  assert(
    m.titleStyles === 1 && m.metaStyles === 1,
    `styles différents entre sujets (${m.titleStyles}, ${m.metaStyles})`,
  );
});

await check('hiérarchie et contraste garantis malgré des jetons défaillants', async () => {
  const m = await measure();
  assert(m.titleSize >= m.metaSize + 3, `titre ${m.titleSize}px vs méta ${m.metaSize}px`);
  assert(m.metaSize >= 12, `méta ${m.metaSize}px`);
  assert(m.metaRatio >= 4.5, `méta à ${m.metaRatio.toFixed(1)}:1`);
  assert(m.headerLinkRatio >= 4.5, `liens de la barre à ${m.headerLinkRatio.toFixed(1)}:1`);
});

await check('les styles par rôle ajoutent sans écraser couleur ni taille', async () => {
  const m = await measure();
  assert(m.titleColor !== 'rgb(255, 0, 255)', 'la couleur du titre a été écrasée par roleStyles');
  assert(m.titleSpacing !== 'normal', 'letter-spacing du rôle titre absent');
});

await check('Garder : le thème est rejoué tel quel au rechargement, sans IA', async () => {
  const before = await measure();
  const reply = (await panel.evaluate((m) => chrome.runtime.sendMessage(m), {
    type: 'keep',
    payload: { tabId, draft },
  })) as { ok: boolean; error?: string };
  assert(reply.ok, `keep : ${reply.error}`);
  await page.reload();
  await page.waitForTimeout(300);
  const after = await measure();
  assert(
    JSON.stringify(after) === JSON.stringify(before),
    `rendu différent après rechargement :\n${JSON.stringify(before)}\n${JSON.stringify(after)}`,
  );
});

/** Position de chaque sujet (titre) et de sa ligne d'infos, pour les 6 premiers. */
const cards = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('tr.qx-entry')].slice(0, 6).map((row) => {
      const title = row.getBoundingClientRect();
      const meta = row.nextElementSibling!.getBoundingClientRect();
      return {
        x: Math.round(title.left),
        top: Math.round(title.top),
        bottom: Math.round(title.bottom),
        width: Math.round(title.width),
        metaX: Math.round(meta.left),
        metaTop: Math.round(meta.top),
      };
    }),
  );

const generate = async (prompt: string) =>
  (await panel.evaluate((m) => chrome.runtime.sendMessage(m), {
    type: 'generate',
    payload: { tabId, prompt, previous: null, pick: null },
  })) as { ok: boolean; data?: { warnings: string[] }; error?: string };

await check(
  '« 3 cartes carrées par rangée » : grille correcte, chaque carte d’un seul tenant',
  async () => {
    requests.length = 0;
    const reply = await generate('grille thème : 3 cartes carrées par rangée');
    assert(reply.ok, `generate : ${reply.error}`);
    assert(
      requests.length === 1,
      `${requests.length} appels LLM : la grille par jetons doit passer du 1er coup`,
    );
    const c = await cards();
    assert(
      new Set(c.slice(0, 3).map((x) => x.x)).size === 3,
      `3 colonnes attendues : ${JSON.stringify(c.slice(0, 3))}`,
    );
    assert(
      c[3]!.x === c[0]!.x && c[3]!.top > c[0]!.bottom,
      'le 4e sujet ne commence pas une nouvelle rangée',
    );
    for (const card of c) {
      assert(card.metaX === card.x, `infos décalées de leur titre (${card.metaX} vs ${card.x})`);
      assert(
        card.metaTop >= card.bottom - 4 && card.metaTop - card.bottom < 48,
        'infos détachées de leur titre',
      );
    }
    assert(c[0]!.width > 200, `cartes trop étroites (${c[0]!.width}px)`);
  },
);

await check(
  'une grille écrite à la main qui déchire les sujets est refusée avec une explication',
  async () => {
    requests.length = 0;
    const reply = await generate('grille à la main');
    assert(requests.length === 2, `${requests.length} appel(s) LLM au lieu de 2 (auto-correction)`);
    assert(/split apart/.test(requests[1]!), 'le problème n’est pas expliqué au LLM');
    assert(
      !reply.ok && /Je n’affiche pas cette mise en page/.test(reply.error ?? ''),
      `pas de refus : ${reply.error}`,
    );
    const preview = await page.evaluate(
      () => document.getElementById('bp-preview')?.textContent ?? '',
    );
    assert(!preview.includes('display: grid'), 'la grille cassée est restée affichée');
  },
);

await context.close();
server.close();
done();
