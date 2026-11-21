// Phase 4 : element picker (survol, ↑ parent, Échap), « Cacher cet élément » sans LLM,
// et prompt ciblé (région pointée + sous-arbre envoyés au LLM).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { assert, check, done, launch, startServer } from './harness.ts';

const PAGE = `<!doctype html><html><head><title>Picker</title>
<style>body{margin:0;font:16px sans-serif} main{padding:20px;min-height:300px} aside{padding:20px;min-height:200px}</style></head>
<body>
  <h1 id="title">Titre</h1>
  <main><p>Paragraphe principal.</p><button id="buy" onclick="window.__clicked=true">Acheter</button></main>
  <aside id="comments"><p id="c1">Premier commentaire assez long</p><p><span class="tiny">petit</span> second</p></aside>
</body></html>`;

let lastUser = '';
async function llm(req: IncomingMessage, res: ServerResponse) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  lastUser = (JSON.parse(raw) as { messages: { content: string }[] }).messages[1]!.content;
  const index = Number(lastUser.match(/pointed at region \[#(\d+)\]/)?.[1] ?? -1);
  const recipe = {
    ops: [
      { op: 'style', target: 't1', declarations: [{ property: 'color', value: 'rgb(255, 0, 0)' }] },
    ],
    targets: [{ key: 't1', regionIndex: index, selectorHints: [] }],
    css: '',
    explanation: 'En rouge.',
  };
  res
    .writeHead(200, { 'Content-Type': 'application/json' })
    .end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(recipe) } }] }));
}

const { server, origin } = await startServer({
  '/': PAGE,
  '/v1/chat/completions': (res) => void llm(res.req, res),
});
const { context, worker, extensionId } = await launch();
await worker.evaluate(
  (baseUrl) => chrome.storage.local.set({ settings: { apiKey: 'k', baseUrl, model: 'm' } }),
  `${origin}/v1`,
);
const page = await context.newPage();
await page.goto(origin);
const tabId = await worker.evaluate(
  async (u) => (await chrome.tabs.query({ url: u + '/*' }))[0]!.id!,
  origin,
);
const panel = await context.newPage();
await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html?tabId=${tabId}`);
await panel.getByTestId('host').filter({ hasText: '127.0.0.1' }).waitFor();

async function hover(selector: string) {
  const box = (await page.locator(selector).boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
}
const overlayPresent = () => page.evaluate(() => !!document.querySelector('[data-bp-picker]'));

console.log('Phase 4');

await check('4.1 Échap annule le pointage', async () => {
  await panel.getByRole('button', { name: '🎯 Pointer un élément' }).click();
  await page.bringToFront();
  await page.waitForFunction(() => !!document.querySelector('[data-bp-picker]'));
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: '🎯 Pointer un élément' }).waitFor({ timeout: 2000 });
  assert(!(await overlayPresent()), 'overlay non retiré');
  assert((await panel.getByTestId('picked').count()) === 0, 'aucun élément ne devait être retenu');
});

await check('4.1 le clic de sélection ne déclenche pas la page', async () => {
  await panel.getByRole('button', { name: '🎯 Pointer un élément' }).click();
  await page.bringToFront();
  await page.waitForFunction(() => !!document.querySelector('[data-bp-picker]'));
  await hover('#buy');
  await page.mouse.click(
    ...(await page
      .locator('#buy')
      .boundingBox()
      .then((b) => [b!.x + 5, b!.y + 5] as const)),
  );
  await panel.getByTestId('picked').waitFor({ timeout: 2000 });
  assert(
    !(await page.evaluate(() => (window as unknown as { __clicked?: boolean }).__clicked)),
    'onclick déclenché',
  );
  assert(
    (await panel.getByTestId('picked').textContent())!.includes('button#buy'),
    'mauvais élément',
  );
});

await check('4.1 ↑ remonte au parent, puis 4.3 « Cacher cet élément » sans LLM', async () => {
  await panel.getByRole('button', { name: '🎯 Pointer un élément' }).click();
  await page.bringToFront();
  await page.waitForFunction(() => !!document.querySelector('[data-bp-picker]'));
  await hover('#c1');
  await page.keyboard.press('ArrowUp');
  const before = lastUser;
  await page.mouse.click(
    ...(await page
      .locator('#c1')
      .boundingBox()
      .then((b) => [b!.x + 5, b!.y + 5] as const)),
  );
  await panel
    .getByTestId('picked')
    .filter({ hasText: 'aside#comments' })
    .waitFor({ timeout: 2000 });
  await panel.getByRole('button', { name: 'Cacher cet élément' }).click();
  await panel.getByTestId('rules').getByText('Cacher « aside#comments').waitFor({ timeout: 3000 });
  await page.waitForSelector('#comments', { state: 'hidden', timeout: 2000 });
  assert(lastUser === before, 'aucun appel LLM attendu');
  const stored = await worker.evaluate(() => chrome.storage.local.get('rules:127.0.0.1'));
  const rule = (
    stored['rules:127.0.0.1'] as { rules: { targets: { t1: { selectors: string[] } } }[] }
  ).rules[0]!;
  assert(rule.targets.t1.selectors[0] === '#comments', JSON.stringify(rule.targets));
});

await check('4.2 prompt ciblé : région pointée + sous-arbre envoyés au LLM', async () => {
  await panel.getByRole('button', { name: 'Modifier' }).click();
  // Rétablir les commentaires pour pointer à l'intérieur.
  await worker.evaluate(() => chrome.storage.local.set({ 'paused:127.0.0.1': true }));
  await page.waitForSelector('#comments', { state: 'visible' });
  await panel.getByRole('button', { name: '🎯 Pointer un élément' }).click();
  await page.bringToFront();
  await page.waitForFunction(() => !!document.querySelector('[data-bp-picker]'));
  await hover('#title');
  await page.mouse.click(
    ...(await page
      .locator('#title')
      .boundingBox()
      .then((b) => [b!.x + 5, b!.y + 5] as const)),
  );
  await panel.getByTestId('picked').filter({ hasText: 'h1#title' }).waitFor({ timeout: 2000 });
  await panel.getByLabel('Que voulez-vous changer ?').fill('en rouge');
  await panel.getByRole('button', { name: 'Prévisualiser' }).click();
  await panel.getByTestId('draft').waitFor({ timeout: 5000 });
  const index = lastUser.match(/pointed at region \[#(\d+)\]/)?.[1];
  assert(index !== undefined, 'région pointée absente du prompt');
  const line = lastUser.split('\n').find((l) => new RegExp(`^\\s*\\[#${index}\\] <`).test(l));
  assert(line?.includes('id="title"'), `mauvaise région : ${line}`);
  await worker.evaluate(() => chrome.storage.local.remove('paused:127.0.0.1'));
  assert(
    (await page.evaluate(() => getComputedStyle(document.getElementById('title')!).color)) ===
      'rgb(255, 0, 0)',
    'preview non appliquée',
  );
});

await check('4.2 le sous-arbre de l’élément pointé est inclus', async () => {
  // Pointe <aside> : son petit <span> (normalement trop petit) doit apparaître.
  const reply = await panel.evaluate(
    (id) =>
      chrome.tabs.sendMessage(id, {
        type: 'distill',
        payload: { include: [], focus: '#comments' },
      }),
    tabId,
  );
  assert(reply.ok && reply.data.regions.includes('<span'), 'span du sous-arbre absent');
  const plain = await panel.evaluate(
    (id) => chrome.tabs.sendMessage(id, { type: 'distill', payload: { include: [], focus: null } }),
    tabId,
  );
  assert(!plain.data.regions.includes('<span'), 'le span ne devrait pas apparaître sans focus');
});

await context.close();
server.close();
done();
