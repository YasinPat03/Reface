// Phase 14 : menus repliés et pages à composants (YouTube).
// - Un menu hamburger (construit comme Wikipédia) est signalé au LLM, qui n'a qu'à choisir
//   `menuBar` : l'extension calcule une vraie barre sous l'en-tête et la rejoue sans IA.
// - Styler le seul bouton du menu n'est plus pris pour un succès : le LLM est relancé.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { COLLAPSED_MENU_PAGE, MENU_LINK_COUNT } from './fixtures/collapsedMenu.ts';
import { assert, check, done, launch, startServer } from './harness.ts';

const requests: string[] = [];

const recipe = (change: Record<string, unknown>) => ({
  changes: [{ title: 'Navbar', ops: [], targets: [], css: '', theme: null, menuBar: 0, ...change }],
  explanation: 'Menu en barre.',
});

function recipeFor(user: string, last: string) {
  const request = user.match(/^User request: (.*)$/m)?.[1] ?? '';
  // Auto-correction : le LLM se reprend et passe par la barre calculée.
  if (last.startsWith('Your recipe was applied')) return recipe({ menuBar: 1 });
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
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(recipeFor(user, last)) } }],
    }),
  );
}

const { server, origin } = await startServer({
  '/wiki': COLLAPSED_MENU_PAGE,
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

await context.close();
server.close();
done();
