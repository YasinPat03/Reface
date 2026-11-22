// Phase 2 : boucle agent complète contre un faux LLM compatible OpenAI.
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  assert,
  check,
  done,
  launch,
  startServer,
  declineRefine,
  isRefineRequest,
} from './harness.ts';

const PAGE = `<!doctype html><html><head><title>Article de test</title>
<style>body{font:16px sans-serif;margin:0} header,nav,main,aside,footer{display:block;padding:20px}
main{width:60%;float:left} aside{width:30%;float:right;min-height:300px} footer{clear:both}</style></head>
<body>
  <header><h1 id="title">Titre de l’article</h1></header>
  <nav aria-label="Principal"><a href="/a">Accueil</a> <a href="/b">Sujets</a> <a href="/c">Contact</a></nav>
  <main><article class="prose css-1x9ab3">
    <p>Premier paragraphe assez long pour être une vraie région de contenu de page.</p>
    <p>Écrivez à jean.dupont@example.com ou au 514 555 1234.</p>
    <form><input name="email" value="secret-valeur@prive.test"><textarea>texte-tres-secret</textarea></form>
  </article></main>
  <aside id="comments" class="comments"><h2>Commentaires</h2><p>Bravo !</p><p>Super</p><p>Merci</p></aside>
  <footer>Pied de page</footer>
</body></html>`;

type Mode = 'normal' | 'iterate' | 'theme' | 'evil-css' | 'bad-schema' | 'unauthorized' | 'flaky';
let mode: Mode = 'normal';
let flakyCalls = 0;
const requests: { body: Record<string, unknown>; user: string; auth: string }[] = [];

function completion(content: unknown) {
  return JSON.stringify({
    choices: [{ message: { role: 'assistant', content: JSON.stringify(content) } }],
  });
}

function regionOf(user: string, needle: RegExp): number {
  const line = user.split('\n').find((l) => needle.test(l));
  const match = line?.match(/\[#(\d+)\]/);
  return match ? Number(match[1]) : -1;
}

async function llm(req: IncomingMessage, res: ServerResponse) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (isRefineRequest(raw)) return declineRefine(res);
  const body = JSON.parse(raw) as { messages: { role: string; content: string }[] };
  const user = body.messages.find((m) => m.role === 'user')?.content ?? '';
  requests.push({ body, user, auth: String(req.headers.authorization) });
  const send = (status: number, text: string) =>
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(text);
  const comments = regionOf(user, /id="comments"/);
  const hideComments = {
    ops: [{ op: 'hide', target: 't1', declarations: [] }],
    targets: [{ key: 't1', regionIndex: comments, selectorHints: [] }],
    css: '',
    explanation: 'Cache les commentaires.',
  };
  switch (mode) {
    case 'normal':
      return send(200, completion(hideComments));
    case 'iterate':
      return send(
        200,
        completion({
          ...hideComments,
          css: 'h1{color:rgb(255,0,0)}',
          explanation: 'Et le titre en rouge.',
        }),
      );
    case 'theme':
      return send(
        200,
        completion({
          ops: [
            {
              op: 'theme',
              target: '',
              declarations: [{ property: 'background-color', value: 'rgb(0, 0, 0)' }],
            },
          ],
          targets: [],
          css: '',
          explanation: 'Fond noir.',
        }),
      );
    case 'evil-css':
      return send(
        200,
        completion({ ...hideComments, css: 'body{background:url(https://evil.test/p.png)}' }),
      );
    case 'bad-schema':
      return send(200, completion({ ops: [{ op: 'script', code: 'alert(1)' }] }));
    case 'unauthorized':
      return send(401, '{"error":{"message":"bad key"}}');
    case 'flaky':
      flakyCalls++;
      return flakyCalls === 1 ? send(500, '{}') : send(200, completion(hideComments));
  }
}

const { server, origin } = await startServer({
  '/': PAGE,
  '/v1/chat/completions': (res) => void llm(res.req, res),
});
const { context, worker, extensionId } = await launch();
await worker.evaluate(
  (baseUrl) =>
    chrome.storage.local.set({ settings: { apiKey: 'sk-test', baseUrl, model: 'mock' } }),
  `${origin}/v1`,
);

const page = await context.newPage();
await page.goto(origin);
const panel = await context.newPage();
await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html`);
await page.bringToFront();

const tabId = await panel.evaluate(
  async (url) => (await chrome.tabs.query({ url: url + '/*' }))[0]!.id!,
  origin,
);
/** Appelle le service worker depuis le panel, comme le fait l'UI. */
const bg = (type: string, payload: Record<string, unknown>) =>
  panel.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [
    type,
    payload,
  ] as const);
const visible = (selector: string) => page.isVisible(selector);
const color = (selector: string) =>
  page.evaluate((s) => getComputedStyle(document.querySelector(s)!).color, selector);

console.log('Phase 2');
let draft: Record<string, unknown> & {
  changes: { targets: Record<string, { selectors: string[] }> }[];
};

await check(
  '2.1/2.4 la requête LLM est distillée, délimitée, sans données de formulaire',
  async () => {
    mode = 'normal';
    const reply = await bg('generate', {
      tabId,
      prompt: 'cache les commentaires',
      previous: null,
      pick: null,
    });
    assert(reply.ok, `generate a échoué : ${reply.error}`);
    draft = reply.data;
    const last = requests.at(-1)!;
    assert(last.auth === 'Bearer sk-test', 'en-tête Authorization manquant');
    const format = last.body.response_format as { json_schema: { strict: boolean } };
    assert(format.json_schema.strict === true, 'structured output strict attendu');
    assert(last.user.includes('<untrusted_page_outline'), 'délimiteurs absents');
    assert(last.user.includes('[#'), 'aucune région');
    for (const secret of [
      'secret-valeur',
      'texte-tres-secret',
      'jean.dupont@example.com',
      '514 555 1234',
    ]) {
      assert(!last.user.includes(secret), `donnée sensible envoyée : ${secret}`);
    }
    assert(!last.user.includes('css-1x9ab3'), 'classe hashée envoyée');
  },
);

await check('2.5 regionIndex → sélecteurs robustes + empreinte', async () => {
  const t1 = draft.changes[0]!.targets.t1!;
  assert(t1.selectors[0] === '#comments', `sélecteurs : ${JSON.stringify(t1.selectors)}`);
  assert(
    (t1 as unknown as { fingerprint: { tag: string } }).fingerprint.tag === 'aside',
    'empreinte absente',
  );
});

await check('2.6 la preview est appliquée dans <style id="bp-preview">', async () => {
  assert(!(await visible('#comments')), 'les commentaires devraient être cachés');
  assert(await page.evaluate(() => !!document.getElementById('bp-preview')), 'bp-preview absent');
});

await check('2.7 itération : la preview courante est renvoyée au LLM et révisée', async () => {
  mode = 'iterate';
  const reply = await bg('generate', {
    tabId,
    prompt: 'et le titre en rouge',
    previous: draft,
    pick: null,
  });
  assert(reply.ok, `itération échouée : ${reply.error}`);
  draft = reply.data;
  const user = requests.at(-1)!.user;
  assert(user.includes('Current edit being previewed'), 'preview courante non envoyée');
  assert(
    /"regionIndex":\d+/.test(user) && !user.includes('"regionIndex":-1'),
    'cible non ré-indexée',
  );
  assert((await color('#title')) === 'rgb(255, 0, 0)', 'titre pas rouge');
  assert(!(await visible('#comments')), 'commentaires réapparus');
  assert((draft.prompts as string[]).length === 2, 'historique des prompts');
});

await check(
  '2.6 Keep : règle enregistrée, CSS précompilé, preview retirée, rejouée au reload',
  async () => {
    const reply = await bg('keep', { tabId, draft });
    assert(reply.ok, `keep a échoué : ${reply.error}`);
    const stored = await worker.evaluate(() =>
      chrome.storage.local.get(['rules:127.0.0.1', 'css:127.0.0.1']),
    );
    const site = stored['rules:127.0.0.1'] as {
      rules: { prompt: string; targets: { t1: { fingerprint: unknown } } }[];
    };
    assert(site.rules.length === 1, 'règle absente');
    assert(
      site.rules[0]!.prompt === 'cache les commentaires → et le titre en rouge',
      site.rules[0]!.prompt,
    );
    assert(site.rules[0]!.targets.t1.fingerprint, 'empreinte non enregistrée');
    assert(JSON.stringify(stored['css:127.0.0.1']).includes('#comments'), 'CSS précompilé absent');
    assert(
      await page.evaluate(() => !document.getElementById('bp-preview')),
      'preview non retirée',
    );
    await page.reload();
    await page.waitForLoadState('load');
    assert(!(await visible('#comments')), 'non rejoué après reload');
    assert((await color('#title')) === 'rgb(255, 0, 0)', 'titre non rejoué');
  },
);

await check('2.6 Discard retire la preview', async () => {
  mode = 'theme';
  const reply = await bg('generate', { tabId, prompt: 'fond noir', previous: null, pick: null });
  assert(reply.ok, reply.error);
  const bgColor = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert((await bgColor()) === 'rgb(0, 0, 0)', 'theme non appliqué');
  await bg('discard', { tabId });
  assert((await bgColor()) !== 'rgb(0, 0, 0)', 'preview non retirée');
});

await check('2.3 CSS malveillant (url()) refusé', async () => {
  mode = 'evil-css';
  const reply = await bg('generate', { tabId, prompt: 'x', previous: null, pick: null });
  assert(!reply.ok && /refusé/.test(reply.error), JSON.stringify(reply));
});

await check('2.2 schéma invalide refusé', async () => {
  mode = 'bad-schema';
  const reply = await bg('generate', { tabId, prompt: 'x', previous: null, pick: null });
  assert(!reply.ok && /format attendu/.test(reply.error), JSON.stringify(reply));
});

await check('2.4 clé refusée : message clair, sans retry', async () => {
  mode = 'unauthorized';
  const before = requests.length;
  const reply = await bg('generate', { tabId, prompt: 'x', previous: null, pick: null });
  assert(!reply.ok && /Clé API refusée/.test(reply.error), JSON.stringify(reply));
  assert(requests.length - before === 1, 'ne doit pas réessayer sur 401');
});

await check('2.4 erreur 500 transitoire : un retry réussit', async () => {
  mode = 'flaky';
  const before = requests.length;
  const reply = await bg('generate', {
    tabId,
    prompt: 'cache les commentaires',
    previous: null,
    pick: null,
  });
  assert(reply.ok, JSON.stringify(reply));
  assert(requests.length - before === 2, `appels : ${requests.length - before}`);
  await bg('discard', { tabId });
});

await check('clé absente : message clair', async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { apiKey: '', baseUrl: 'x', model: 'm' } }),
  );
  const reply = await bg('generate', { tabId, prompt: 'x', previous: null, pick: null });
  assert(!reply.ok && /Aucune clé API/.test(reply.error), JSON.stringify(reply));
});

await context.close();
server.close();
done();
