// Phase 3 : Options, chat, règles, pause et Catalogue privé/public — via la vraie UI.
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

const PAGE = `<!doctype html><html><head><title>Démo</title></head><body>
  <header><h1 id="title">Titre</h1></header>
  <main style="min-height:400px"><p>Contenu principal de la page de démonstration.</p></main>
  <aside id="comments" style="min-height:300px"><h2>Commentaires</h2><p>a</p><p>b</p><p>c</p></aside>
</body></html>`;

async function llm(req: IncomingMessage, res: ServerResponse) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (isRefineRequest(raw)) return declineRefine(res);
  const user = (JSON.parse(raw) as { messages: { content: string }[] }).messages[1]!.content;
  const line = user.split('\n').find((l) => l.includes('id="comments"'));
  const regionIndex = Number(line?.match(/\[#(\d+)\]/)?.[1] ?? -1);
  const recipe = {
    ops: [{ op: 'hide', target: 't1', declarations: [] }],
    targets: [{ key: 't1', regionIndex, selectorHints: [] }],
    css: '',
    explanation: 'Cache les commentaires.',
  };
  res
    .writeHead(200, { 'Content-Type': 'application/json' })
    .end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(recipe) } }] }));
}

const { server, origin } = await startServer({
  '/': PAGE,
  '/another': PAGE,
  '/v1/chat/completions': (res) => void llm(res.req, res),
  '/v1/models': (res) =>
    res
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ data: [{ id: 'mock-fast' }, { id: 'mock-big' }] })),
});
const { context, worker, extensionId } = await launch();
const ext = (path: string) => `chrome-extension://${extensionId}/${path}`;
const storage = (keys: string[]) => worker.evaluate((k) => chrome.storage.local.get(k), keys);

console.log('Phase 3');

await check('3.1 Options : enregistrer et tester la connexion', async () => {
  const options = await context.newPage();
  await options.goto(ext('src/options/index.html'));
  await options.getByLabel('API key').fill('sk-test');
  await options.getByLabel('Base URL (OpenAI-compatible API)').fill(`${origin}/v1`);
  await options.getByLabel('Model').fill('mock-fast');
  await options.getByRole('button', { name: 'Save' }).click();
  await options.getByText('Saved.').waitFor();
  const { settings } = await storage(['settings']);
  assert(
    JSON.stringify(settings) ===
      JSON.stringify({ apiKey: 'sk-test', baseUrl: `${origin}/v1`, model: 'mock-fast' }),
    JSON.stringify(settings),
  );
  await options.getByRole('button', { name: 'Test connection' }).click();
  await options.getByText('Connection successful (2 models)').waitFor({ timeout: 5000 });
  await options.getByText('“mock-fast” is available').waitFor();
  await options.close();
});

const page = await context.newPage();
await page.goto(origin);
const panel = await context.newPage();
const tabId = await worker.evaluate(
  async (url) => (await chrome.tabs.query({ url: url + '/*' }))[0]!.id!,
  origin,
);
await panel.goto(ext(`src/panel/index.html?tabId=${tabId}`));
const commentsVisible = () => page.isVisible('#comments');
let publications: Record<string, unknown>[] = [];
await context.route(/(?:\/api\/catalogue|\/functions\/v1\/reface-catalogue)$/, async (route) => {
  if (route.request().method() === 'POST') {
    const incoming = route.request().postDataJSON() as Record<string, unknown>;
    const entry = { ...incoming, id: 'c_e2e_publication', createdAt: new Date().toISOString() };
    publications = [entry];
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(entry),
    });
  } else
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(publications),
    });
});

await check('3.2 chat : saisie → preview → Garder', async () => {
  await panel.getByTestId('host').filter({ hasText: '127.0.0.1' }).waitFor();
  await panel
    .getByRole('textbox', { name: 'What do you want to change?' })
    .fill('Hide the comments');
  await panel.getByRole('button', { name: 'Preview' }).click();
  await panel.getByTestId('draft').waitFor({ timeout: 5000 });
  assert(!(await commentsVisible()), 'preview non appliquée');
  await panel.getByRole('button', { name: 'Keep' }).click();
  await panel.getByTestId('rules').waitFor({ timeout: 5000 });
  assert(!(await commentsVisible()), 'règle non appliquée');
});

await check('3.3 liste : toggle off/on en direct', async () => {
  const toggle = panel.getByRole('switch', { name: 'Turn off this change' });
  await toggle.click();
  await page.waitForSelector('#comments', { state: 'visible', timeout: 2000 });
  await panel.getByRole('switch', { name: 'Turn on this change' }).click();
  await page.waitForSelector('#comments', { state: 'hidden', timeout: 2000 });
  await panel.getByRole('tab', { name: 'Changes (1/1)', exact: true }).waitFor();
});

await check('3.4 Original / Modifié (temporaire, sans toucher au stockage)', async () => {
  await panel.getByRole('radio', { name: 'Original' }).click();
  await page.waitForSelector('#comments', { state: 'visible', timeout: 2000 });
  const { 'css:127.0.0.1': css } = await storage(['css:127.0.0.1']);
  assert(JSON.stringify(css).includes('#comments'), 'le stockage ne doit pas changer');
  await panel.getByRole('radio', { name: 'Modified' }).click();
  await page.waitForSelector('#comments', { state: 'hidden', timeout: 2000 });
});

await check('3.4 Pause sur ce site', async () => {
  await panel.getByRole('switch', { name: 'Pause on this site' }).click();
  await page.waitForSelector('#comments', { state: 'visible', timeout: 2000 });
  assert((await storage(['paused:127.0.0.1']))['paused:127.0.0.1'] === true, 'pause non stockée');
  await page.reload();
  assert(await commentsVisible(), 'pause non respectée au reload');
  await panel.getByRole('switch', { name: 'Pause on this site' }).click();
  await page.waitForSelector('#comments', { state: 'hidden', timeout: 2000 });
});

await check('3.5 Catalogue : enregistrer les modifications de la page dans Privée', async () => {
  await panel.getByRole('tab', { name: 'Catalogue', exact: true }).click();
  await panel
    .getByRole('tabpanel', { name: 'Private' })
    .getByRole('button', { name: 'Save this page' })
    .click();
  await panel.getByLabel('Title', { exact: true }).fill('Page sans commentaires');
  await panel.getByLabel('Short description').fill('Une page plus calme pour lire.');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: 'private collection' }).waitFor();
  await panel.getByRole('heading', { name: 'Page sans commentaires' }).waitFor();
});

await check('3.3 supprimer une règle conserve le thème privé', async () => {
  await panel.getByRole('tab', { name: /Changes \(/ }).click();
  await panel.getByRole('button', { name: 'Delete this change' }).click();
  await panel.getByText('No saved changes on this site.').waitFor();
  await page.waitForSelector('#comments', { state: 'visible', timeout: 2000 });
});

await check('3.6 Catalogue : appliquer le thème privé sans ajouter de doublon', async () => {
  await panel.getByRole('tab', { name: 'Catalogue', exact: true }).click();
  await panel.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.waitForSelector('#comments', { state: 'hidden', timeout: 2000 });
  await panel.getByRole('button', { name: 'Applied', exact: true }).waitFor();
  const data = await storage(['rules:127.0.0.1']);
  assert((data['rules:127.0.0.1'] as { rules: unknown[] }).rules.length === 1, 'règles dupliquées');
});

await check('3.6 Catalogue : le thème ne déborde pas sur une autre page', async () => {
  await page.goto(origin + '/another');
  assert(await commentsVisible(), 'thème appliqué à une autre page');
  await page.goto(origin);
  await page.waitForSelector('#comments', { state: 'hidden', timeout: 2000 });
});

await check(
  '3.7 Catalogue : publier avec titre et description puis importer depuis Publique',
  async () => {
    await panel.getByRole('button', { name: 'Publish', exact: true }).click();
    await panel.getByLabel('Title', { exact: true }).fill('Lecture partagée');
    await panel
      .getByLabel('Short description')
      .fill('Le thème de lecture publié pour la démonstration.');
    const code = panel.getByLabel('Publishing code');
    if (await code.isVisible()) await code.fill('rfc_' + 'a'.repeat(43));
    await panel
      .getByRole('form', { name: 'Publish a theme' })
      .getByRole('button', { name: 'Publish', exact: true })
      .click();
    await panel.getByRole('status').filter({ hasText: 'was published' }).waitFor();
    await panel.getByRole('tab', { name: 'Public', exact: true }).click();
    await panel.getByRole('heading', { name: 'Lecture partagée' }).waitFor();
    await panel.getByRole('button', { name: 'In your collection' }).waitFor();
    await panel.getByRole('tab', { name: /Private/ }).click();
    await panel.getByRole('button', { name: /Delete .* from the private collection/ }).click();
    await panel.getByRole('tab', { name: 'Public', exact: true }).click();
    await panel.getByRole('button', { name: 'Add to my collection' }).click();
    await panel.getByRole('button', { name: 'In your collection' }).waitFor();
    await panel.getByRole('tab', { name: /Private/ }).click();
    await panel.getByRole('heading', { name: 'Lecture partagée' }).waitFor();
  },
);

await context.close();
server.close();
done();
