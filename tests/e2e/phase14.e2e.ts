// Phase 14 : menus repliés et pages à composants (YouTube).
// - Un menu hamburger (construit comme Wikipédia) est signalé au LLM, qui n'a qu'à choisir
//   `menuBar` : l'extension calcule une vraie barre sous l'en-tête et la rejoue sans IA.
// - Styler le seul bouton du menu n'est plus pris pour un succès : le LLM est relancé.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { COLLAPSED_MENU_PAGE, MENU_LINK_COUNT } from './fixtures/collapsedMenu.ts';
import { VIDEO_RESULTS_PAGE } from './fixtures/videoResults.ts';
import { assert, check, done, launch, startServer } from './harness.ts';

const requests: string[] = [];

/** Cartes en grille de 3 (thème par jetons), comme « 3 cards per row » sur YouTube. */
const GRID_THEME = {
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
  shape: { radius: 10, shadow: 'none' },
  layout: {
    cards: true,
    density: 'comfortable',
    maxWidth: 0,
    dividers: false,
    columns: 3,
    cardShape: 'auto',
  },
  roleStyles: [],
};

const recipe = (change: Record<string, unknown>) => ({
  changes: [{ title: 'Navbar', ops: [], targets: [], css: '', theme: null, menuBar: 0, ...change }],
  explanation: 'Menu en barre.',
});

function recipeFor(user: string, last: string) {
  const request = user.match(/^User request: (.*)$/m)?.[1] ?? '';
  // Auto-correction : le LLM se reprend et passe par la barre calculée.
  if (last.startsWith('Your recipe was applied')) return recipe({ menuBar: 1 });
  if (request.includes('3 cards per row')) return recipe({ title: 'Cards', theme: GRID_THEME });
  if (request.includes('bouton seul')) {
    // Ce qu'un LLM peut faire sans voir le menu : styler la région du hamburger.
    const region = Number(user.match(/\[#(\d+)\] <nav [^\n]*main-menu-landmark/)?.[1] ?? -1);
    return recipe({
      ops: [
        {
          op: 'style',
          target: 't1',
          declarations: [
            { property: 'display', value: 'flex' },
            { property: 'gap', value: '16px' },
          ],
        },
      ],
      targets: [{ key: 't1', regionIndex: region, selectorHints: [], scope: 'one' }],
    });
  }
  return recipe({ menuBar: user.includes('[menu 1]') ? 1 : 0 });
}

async function llm(req: IncomingMessage, res: ServerResponse) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const messages = (JSON.parse(raw) as { messages: { content: string }[] }).messages;
  const user = messages[1]!.content;
  const last = messages.at(-1)!.content;
  requests.push(last);
  // L'auto-correction prend du temps, comme avec un vrai LLM : la page a le temps de peindre.
  if (last.startsWith('Your recipe was applied')) await new Promise((ok) => setTimeout(ok, 300));
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(recipeFor(user, last)) } }],
    }),
  );
}

const { server, origin } = await startServer({
  '/wiki': COLLAPSED_MENU_PAGE,
  '/results': VIDEO_RESULTS_PAGE,
  '/v1/chat/completions': (res) => void llm(res.req, res),
});
const { context, worker, extensionId } = await launch();
await worker.evaluate(
  (baseUrl) =>
    chrome.storage.local.set({ settings: { apiKey: 'sk-test', baseUrl, model: 'mock' } }),
  `${origin}/v1`,
);
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${origin}/wiki`);
const tabId = await worker.evaluate(
  async (url) => (await chrome.tabs.query({ url: url + '/*' }))[0]!.id!,
  origin,
);
const panel = await context.newPage();
await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html?tabId=${tabId}`);

const send = async <T>(type: string, payload: unknown) =>
  (await panel.evaluate((m) => chrome.runtime.sendMessage(m), { type, payload })) as {
    ok: boolean;
    data?: T;
    error?: string;
  };

/** Position des liens du menu, de l'en-tête et du titre de l'article. */
const layout = () =>
  page.evaluate(() => {
    const links = [...document.querySelectorAll('#main-menu a')];
    const box = (e: Element | null) => e?.getBoundingClientRect();
    const shown = (e: Element) =>
      e.checkVisibility({ visibilityProperty: true, opacityProperty: true });
    return {
      visible: links.filter(shown).length,
      rows: new Set(links.filter(shown).map((a) => Math.round(box(a)!.top))).size,
      linksTop: Math.min(...links.map((a) => box(a)!.top)),
      linksBottom: Math.max(...links.map((a) => box(a)!.bottom)),
      linksRight: Math.max(...links.map((a) => box(a)!.right)),
      headerBottom: box(document.querySelector('header'))!.bottom,
      titleTop: box(document.querySelector('h1'))!.top,
      labelShown: shown(document.querySelector('#main-menu-label')!),
      headingsShown: [...document.querySelectorAll('.menu-heading')].filter(shown).length,
    };
  });

console.log('Phase 14 : menus repliés');
let draft: unknown = null;

await check('le menu replié est signalé au LLM avec des sélecteurs vérifiés', async () => {
  requests.length = 0;
  const reply = await send<{ warnings: string[]; layoutIssues: string[] }>('generate', {
    tabId,
    prompt: 'turn the hamburger menu into a navbar',
    previous: null,
    pick: null,
  });
  assert(reply.ok, `generate : ${reply.error}`);
  draft = reply.data;
  const user = requests[0]!;
  const line = user.split('\n').find((l) => l.startsWith('- [menu 1]'));
  assert(line, 'aucun « [menu 1] » dans l’instantané envoyé au LLM');
  assert(line.includes('"Main menu"'), `libellé absent : ${line}`);
  assert(line.includes(`${MENU_LINK_COUNT} links`), `nombre de liens absent : ${line}`);
  const panelSelector = line.match(/panel "([^"]+)"/)?.[1];
  assert(panelSelector, `sélecteur du panneau absent : ${line}`);
  const matches = await page.evaluate(
    (s) => [...document.querySelectorAll(s)].map((e) => e.className),
    panelSelector,
  );
  assert(
    matches.length === 1 && matches[0] === 'dropdown-content',
    `le sélecteur « ${panelSelector} » ne vise pas le panneau : ${JSON.stringify(matches)}`,
  );
});

await check('menuBar : une vraie barre sous l’en-tête, sans chevauchement', async () => {
  assert(requests.length === 1, `${requests.length} appels LLM : la barre doit passer du 1er coup`);
  const d = draft as { warnings: string[]; layoutIssues: string[] };
  assert(!d.warnings.length, `avertissements : ${d.warnings.join(' | ')}`);
  assert(!d.layoutIssues.length, `problèmes : ${d.layoutIssues.join(' | ')}`);
  const m = await layout();
  assert(m.visible === MENU_LINK_COUNT, `${m.visible}/${MENU_LINK_COUNT} liens visibles`);
  assert(m.rows === 1, `liens sur ${m.rows} rangées au lieu d’une barre`);
  assert(m.linksTop >= m.headerBottom - 1, 'la barre chevauche l’en-tête');
  assert(m.titleTop >= m.linksBottom, 'la barre recouvre le titre de l’article');
  assert(m.linksRight <= 1280, 'la barre déborde de la fenêtre');
  assert(!m.labelShown && m.headingsShown === 0, 'bouton ou intitulés encore visibles');
});

await check('Garder : la barre est rejouée au rechargement, sans IA', async () => {
  const before = await layout();
  const reply = await send('keep', { tabId, draft });
  assert(reply.ok, `keep : ${reply.error}`);
  requests.length = 0;
  await page.reload();
  await page.waitForTimeout(300);
  const after = await layout();
  assert(
    JSON.stringify(after) === JSON.stringify(before),
    `rendu différent :\n${JSON.stringify(before)}\n${JSON.stringify(after)}`,
  );
  assert(requests.length === 0, 'un appel LLM a eu lieu au rechargement');
  await worker.evaluate(
    (host) => chrome.storage.local.remove([`rules:${host}`, `css:${host}`]),
    '127.0.0.1',
  );
  await page.reload();
});

await check('styler le seul bouton n’est plus un succès : le LLM est relancé', async () => {
  requests.length = 0;
  const reply = await send<{ warnings: string[] }>('generate', {
    tabId,
    prompt: 'bouton seul : turn the hamburger menu into a navbar',
    previous: null,
    pick: null,
  });
  assert(reply.ok, `generate : ${reply.error}`);
  assert(requests.length === 2, `${requests.length} appel(s) LLM au lieu de 2 (auto-correction)`);
  assert(/NO visible effect/.test(requests[1]!), 'le « sans effet » n’est pas expliqué au LLM');
  const m = await layout();
  assert(m.visible === MENU_LINK_COUNT && m.rows === 1, 'la correction n’a pas donné la barre');
});

await check('un seul restylage visible : la v1 rejetée n’est jamais peinte', async () => {
  await page.reload();
  // À chaque frame peinte, la preview affichée.
  await page.evaluate(() => {
    const w = window as unknown as { __painted: Set<string> };
    w.__painted = new Set();
    const loop = () => {
      w.__painted.add(document.getElementById('bp-preview')?.textContent ?? '');
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const reply = await send('generate', {
    tabId,
    prompt: 'bouton seul : turn the hamburger menu into a navbar',
    previous: null,
    pick: null,
  });
  assert(reply.ok, `generate : ${reply.error}`);
  await page.waitForTimeout(200);
  const { painted, final } = await page.evaluate(() => ({
    painted: [...(window as unknown as { __painted: Set<string> }).__painted],
    final: document.getElementById('bp-preview')?.textContent ?? '',
  }));
  const others = painted.filter((css) => css !== '' && css !== final);
  assert(/position: ?absolute/.test(final), 'la barre finale n’est pas appliquée');
  assert(
    !others.length,
    `version intermédiaire peinte : ${others.map((c) => c.slice(0, 80)).join(' | ')}`,
  );
});

console.log('Phase 14 : pages à composants (YouTube)');
const results = await context.newPage();
await results.setViewportSize({ width: 1280, height: 800 });
await results.goto(`${origin}/results`);
const resultsTab = await worker.evaluate(
  async (url) => (await chrome.tabs.query({ url }))[0]!.id!,
  `${origin}/results`,
);

await check(
  '3 cartes par rangée : cartes empilées, rien d’écrasé, pas d’auto-correction',
  async () => {
    requests.length = 0;
    const reply = await send<{ warnings: string[]; layoutIssues: string[] }>('generate', {
      tabId: resultsTab,
      prompt: '3 cards per row',
      previous: null,
      pick: null,
    });
    assert(reply.ok, `generate : ${reply.error}`);
    // Titres coupés à 2 lignes : leurs lignes masquées ne comptent plus comme des chevauchements.
    assert(
      requests.length === 1,
      `${requests.length} appels LLM : ${reply.data?.layoutIssues.join(' | ')}`,
    );
    const m = await results.evaluate(() => {
      const box = (e: Element | null) => e!.getBoundingClientRect();
      const cards = [...document.querySelectorAll('ytd-video-renderer')].slice(0, 6);
      const container = box(document.querySelector('#contents'));
      return {
        lefts: new Set(cards.slice(0, 3).map((c) => Math.round(box(c).left))).size,
        stacked: cards.every(
          (c) => box(c.querySelector('ytd-thumbnail')).bottom <= box(c.querySelector('h3')).top + 1,
        ),
        contained: cards.every(
          (c) => box(c.querySelector('ytd-thumbnail')).right <= box(c).right + 1,
        ),
        playlist: box(document.querySelector('yt-lockup-view-model')).width / container.width,
        shelf: box(document.querySelector('grid-shelf-view-model')).width / container.width,
      };
    });
    assert(m.lefts === 3, `${m.lefts} colonne(s) au lieu de 3`);
    assert(m.stacked, 'une miniature n’est pas au-dessus de son titre');
    assert(m.contained, 'une miniature déborde de sa carte');
    assert(
      m.playlist > 0.9 && m.shelf > 0.9,
      `playlist ou étagère écrasée (${m.playlist}, ${m.shelf})`,
    );
  },
);

await check('ce que voit le LLM : classes entières, pas de chemin positionnel', async () => {
  const user = requests[0]!;
  const outline = user.split('<untrusted_page_outline')[1] ?? '';
  assert(!/class="[^"]*…"/.test(outline), 'une classe est tronquée dans le plan');
  // Chaque classe citée existe telle quelle sur la page (une classe coupée ne viserait rien).
  const tokens = [...outline.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1]!.split(' '));
  const missing = await results.evaluate(
    (names) => names.filter((n) => !document.getElementsByClassName(n).length),
    [...new Set(tokens)],
  );
  assert(tokens.length > 5 && !missing.length, `classes inexistantes : ${missing.join(', ')}`);
  const lists = user.split('\n').filter((l) => /^- \d+× "/.test(l));
  assert(
    lists.some((l) => l.startsWith('- 12× "ytd-video-renderer"')),
    lists.join('\n'),
  );
  assert(
    lists.every((l) => (l.match(/:nth-/g)?.length ?? 0) <= 1),
    `chemin positionnel profond : ${lists.join('\n')}`,
  );
});

await context.close();
server.close();
done();
