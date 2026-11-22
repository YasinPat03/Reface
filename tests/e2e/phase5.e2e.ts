// Phase 5 : sites sensibles (rien n'est envoyé, le rejeu marche), health check, erreurs.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { assert, check, done, launch, startServer } from './harness.ts';

const PAGE = `<!doctype html><html><head><title>P5</title></head><body>
  <h1 id="title">Titre</h1><main style="min-height:300px"><p>Contenu</p></main>
  <aside id="comments" style="min-height:200px"><p>Commentaires</p></aside>
</body></html>`;

let llmCalls = 0;
async function llm(_req: IncomingMessage, res: ServerResponse) {
  llmCalls++;
  res.writeHead(500).end('{}');
}

const { server, origin } = await startServer({
  '/': PAGE,
  '/v1/chat/completions': (res) => void llm(res.req, res),
});
const port = new URL(origin).port;
// mybank.test → serveur local : un faux site bancaire.
const { context, worker, extensionId } = await launch([
  `--host-resolver-rules=MAP *.test 127.0.0.1:${port}`,
]);
await worker.evaluate(
  (baseUrl) => chrome.storage.local.set({ settings: { apiKey: 'k', baseUrl, model: 'm' } }),
  `${origin}/v1`,
);
const tabIdOf = (url: string) =>
  worker.evaluate(async (u) => (await chrome.tabs.query({ url: u + '*' }))[0]!.id!, url);

console.log('Phase 5');

const bank = await context.newPage();
await bank.goto('http://mybank.test/');
const bankTab = await tabIdOf('http://mybank.test/');
const panel = await context.newPage();
await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html?tabId=${bankTab}`);
const bg = (type: string, payload: Record<string, unknown>) =>
  panel.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [
    type,
    payload,
  ] as const);

await check('5.1 site sensible : generate refusé, AUCUN appel au LLM', async () => {
  const reply = await bg('generate', {
    tabId: bankTab,
    prompt: 'cache les commentaires',
    previous: null,
    pick: null,
  });
  assert(
    !reply.ok && /aucun contenu de cette page n’est envoyé/.test(reply.error),
    JSON.stringify(reply),
  );
  assert(llmCalls === 0, `appels LLM : ${llmCalls}`);
});

await check('5.1 site sensible : bannière dans le panel, prompt désactivé', async () => {
  await panel.getByTestId('ai-blocked').waitFor({ timeout: 3000 });
  assert(await panel.getByLabel('Que voulez-vous changer ?').isDisabled(), 'prompt actif');
  assert(
    await panel.getByRole('button', { name: 'Pointer un élément' }).isEnabled(),
    'picker désactivé',
  );
});

await check('5.1 site sensible : le rejeu des règles existantes fonctionne', async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ 'css:mybank.test': '#comments{display:none!important}' }),
  );
  await bank.reload();
  await bank.waitForLoadState('load');
  assert(!(await bank.isVisible('#comments')), 'règle non rejouée');
});

// --- Health check sur 127.0.0.1 ---
const now = new Date(Date.now() - 2 * 86_400_000).toISOString();
const rule = (id: string, selector: string, pagePath?: string) => ({
  id,
  kind: 'restyle',
  createdAt: now,
  prompt: id,
  urlPattern: `${origin}/*`,
  ...(pagePath ? { pagePath } : {}),
  enabled: true,
  ops: [{ op: 'hide', target: 't1' }],
  targets: { t1: { selectors: [selector], minMatches: 1 } },
  css: '',
  explanation: '',
  intent: null,
  health: { lastOk: now, failures: 0, status: 'ok' },
});
await worker.evaluate(
  (rules) => chrome.storage.local.set({ 'rules:127.0.0.1': { host: '127.0.0.1', rules } }),
  [
    rule('r_ok', '#comments', '/'),
    rule('r_broken', '#disparu', '/'),
    rule('r_other', '#disparu', '/autre/page'),
  ],
);
const health = async () => {
  const s = await worker.evaluate(() => chrome.storage.local.get('rules:127.0.0.1'));
  const rules = (
    s['rules:127.0.0.1'] as {
      rules: { id: string; health: { status: string; failures: number; lastOk: string } }[];
    }
  ).rules;
  return Object.fromEntries(rules.map((r) => [r.id, r.health]));
};

const page = await context.newPage();
await page.goto(origin);

await check('5.2 health check automatique : la règle cassée devient « suspecte »', async () => {
  const deadline = Date.now() + 9000;
  let h = await health();
  while (h.r_broken!.status !== 'suspect' && Date.now() < deadline) {
    await page.waitForTimeout(300);
    h = await health();
  }
  assert(
    h.r_broken!.status === 'suspect' && h.r_broken!.failures === 1,
    JSON.stringify(h.r_broken),
  );
  assert(
    h.r_ok!.status === 'ok' && h.r_ok!.lastOk !== now,
    `lastOk rafraîchi : ${JSON.stringify(h.r_ok)}`,
  );
  assert(
    h.r_other!.status === 'ok' && h.r_other!.failures === 0,
    'une règle d’une autre page ne doit pas être vérifiée ici',
  );
});

await check('5.2 le badge de règle cassée apparaît dans le panel', async () => {
  const tabId = await tabIdOf(origin + '/');
  const p = await context.newPage();
  await p.goto(`chrome-extension://${extensionId}/src/panel/index.html?tabId=${tabId}`);
  await p.getByRole('tab', { name: /Modifications \(/ }).click();
  const badge = p.getByTestId('rules').getByText('cassée', { exact: true });
  await badge.waitFor({ timeout: 3000 });
  assert((await badge.count()) === 1, 'un seul badge attendu');
  await p.close();
});

await check('5.2 la règle redevient « ok » quand l’élément revient', async () => {
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.id = 'disparu';
    document.body.append(el);
  });
  const tabId = await tabIdOf(origin + '/');
  await panel.evaluate(
    (id) => chrome.tabs.sendMessage(id, { type: 'healthCheck', payload: {} }),
    tabId,
  );
  const h = await health();
  assert(h.r_broken!.status === 'ok' && h.r_broken!.failures === 0, JSON.stringify(h.r_broken));
});

await check('5.3 erreur 500 persistante : message clair après un retry', async () => {
  const tabId = await tabIdOf(origin + '/');
  const before = llmCalls;
  const reply = await bg('generate', { tabId, prompt: 'x', previous: null, pick: null });
  assert(!reply.ok && /répondu 500/.test(reply.error), JSON.stringify(reply));
  assert(llmCalls - before === 2, `appels : ${llmCalls - before}`);
});

await check('5.3 page sans content script : message « rechargez l’onglet »', async () => {
  // Un onglet about:blank n'a pas de content script : l'erreur Chrome brute doit être traduite.
  const id = await worker.evaluate(
    async () => (await chrome.tabs.create({ url: 'about:blank' })).id,
  );
  assert(id !== undefined, 'onglet about:blank non créé');
  const reply = await bg('discard', { tabId: id });
  assert(!reply.ok && /rechargez l’onglet/.test(reply.error), JSON.stringify(reply));
  await worker.evaluate((tabId) => chrome.tabs.remove(tabId!), id);
});

await context.close();
server.close();
done();
