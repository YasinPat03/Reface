// Phase 6 : un long prompt « X, Y et Z » donne des changements séparés, cochables en preview
// et activables un par un dans la liste des règles — via la vraie UI du panel.
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

const PAGE = `<!doctype html><html><head><title>Démo</title>
<style>body{font:16px sans-serif} main{min-height:300px} aside{min-height:200px}</style></head><body>
  <header><h1 id="title">Titre</h1></header>
  <main id="content"><p>Contenu principal de la page de démonstration.</p></main>
  <aside id="comments"><h2>Commentaires</h2><p>a</p><p>b</p><p>c</p></aside>
</body></html>`;

const requests: string[] = [];

function regionOf(user: string, needle: string): number {
  const line = user.split('\n').find((l) => l.includes(needle));
  return Number(line?.match(/\[#(\d+)\]/)?.[1] ?? -1);
}

async function llm(req: IncomingMessage, res: ServerResponse) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (isRefineRequest(raw)) return declineRefine(res);
  const user = (JSON.parse(raw) as { messages: { content: string }[] }).messages[1]!.content;
  requests.push(user);
  const change = (title: string, op: string, needle: string, declarations: unknown[] = []) => ({
    title,
    ops: [{ op, target: 't1', declarations }],
    targets: [{ key: 't1', regionIndex: regionOf(user, needle), selectorHints: [], scope: 'one' }],
    css: '',
  });
  const hide = change('Cacher les commentaires', 'hide', 'id="comments"');
  const red = change('Titre en rouge', 'style', 'id="title"', [
    { property: 'color', value: 'rgb(255, 0, 0)' },
  ]);
  const big = { title: 'Texte plus grand', ops: [], targets: [], css: 'main p{font-size:30px}' };
  const recipe = user.includes('Current edit being previewed')
    ? // Itération : le LLM renvoie la recette complète révisée + un nouveau changement.
      {
        changes: [
          hide,
          big,
          {
            title: 'Fond gris',
            ops: [],
            targets: [],
            css: 'body{background-color:rgb(200, 200, 200)}',
          },
        ],
        explanation: 'Et un fond gris.',
      }
    : { changes: [hide, red, big], explanation: 'Trois modifications.' };
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
  (baseUrl) =>
    chrome.storage.local.set({ settings: { apiKey: 'sk-test', baseUrl, model: 'mock' } }),
  `${origin}/v1`,
);
const page = await context.newPage();
await page.goto(origin);
const tabId = await worker.evaluate(
  async (url) => (await chrome.tabs.query({ url: url + '/*' }))[0]!.id!,
  origin,
);
const panel = await context.newPage();
await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html?tabId=${tabId}`);

const style = (selector: string, property: string) =>
  page.evaluate(
    ([s, p]) => getComputedStyle(document.querySelector(s!)!).getPropertyValue(p!),
    [selector, property],
  );
const titleRed = async () => (await style('#title', 'color')) === 'rgb(255, 0, 0)';
const textBig = async () => (await style('main p', 'font-size')) === '30px';
const commentsHidden = async () => !(await page.isVisible('#comments'));
const greyBg = async () => (await style('body', 'background-color')) === 'rgb(200, 200, 200)';

console.log('Phase 6');

await check('un long prompt donne 3 changements cochés en preview', async () => {
  await panel.getByTestId('host').filter({ hasText: '127.0.0.1' }).waitFor();
  await panel
    .getByLabel('Que voulez-vous changer ?')
    .fill('Cache les commentaires, mets le titre en rouge et agrandis le texte');
  await panel.getByRole('button', { name: 'Prévisualiser' }).click();
  await panel.getByTestId('draft-changes').waitFor({ timeout: 5000 });
  const boxes = panel.getByTestId('draft-changes').getByRole('checkbox');
  assert((await boxes.count()) === 3, `cases : ${await boxes.count()}`);
  assert(requests[0]!.length > 0, 'aucun appel LLM');
  assert((await commentsHidden()) && (await titleRed()) && (await textBig()), 'preview incomplète');
});

await check('décocher un changement le retire de la preview en direct', async () => {
  await panel.getByRole('checkbox', { name: 'Titre en rouge' }).uncheck();
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('#title')!).color !== 'rgb(255, 0, 0)',
    null,
    { timeout: 2000 },
  );
  assert((await commentsHidden()) && (await textBig()), 'les autres changements ont disparu');
  await panel.getByRole('checkbox', { name: 'Titre en rouge' }).check();
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('#title')!).color === 'rgb(255, 0, 0)',
    null,
    { timeout: 2000 },
  );
});

await check('itération : seuls les changements cochés sont renvoyés au LLM', async () => {
  await panel.getByRole('checkbox', { name: 'Titre en rouge' }).uncheck();
  await panel.getByLabel('Affiner la modification').fill('et un fond gris');
  await panel.getByRole('button', { name: 'Réviser' }).click();
  await panel.getByRole('checkbox', { name: 'Fond gris' }).waitFor({ timeout: 5000 });
  const sent = requests.at(-1)!;
  assert(sent.includes('Cacher les commentaires'), 'changement coché non renvoyé');
  assert(!sent.includes('Titre en rouge'), 'changement décoché renvoyé au LLM');
  const titles = await panel.getByTestId('draft-changes').locator('li > span').allTextContents();
  assert(
    JSON.stringify(titles) ===
      JSON.stringify(['Cacher les commentaires', 'Texte plus grand', 'Fond gris']),
    JSON.stringify(titles),
  );
  assert((await greyBg()) && !(await titleRed()), 'preview révisée incorrecte');
});

await check('Garder : une règle par changement coché', async () => {
  await panel.getByRole('checkbox', { name: 'Fond gris' }).uncheck();
  await panel.getByRole('button', { name: 'Garder' }).click();
  await panel
    .getByRole('tab', { name: 'Modifications (2/2)', exact: true })
    .waitFor({ timeout: 5000 });
  const stored = await worker.evaluate(() => chrome.storage.local.get('rules:127.0.0.1'));
  const rules = (stored['rules:127.0.0.1'] as { rules: { title: string; prompt: string }[] }).rules;
  assert(
    JSON.stringify(rules.map((r) => r.title)) ===
      JSON.stringify(['Cacher les commentaires', 'Texte plus grand']),
    JSON.stringify(rules),
  );
  assert(
    rules.every((r) => r.prompt.startsWith('Cache les commentaires, mets le titre')),
    'prompt d’origine perdu',
  );
  assert(
    (await commentsHidden()) && (await textBig()) && !(await greyBg()),
    'règles non appliquées',
  );
});

await check('liste : chaque changement s’active / se désactive séparément', async () => {
  const rows = panel.getByTestId('rules').locator('li');
  assert((await rows.count()) === 2, `lignes : ${await rows.count()}`);
  const hideRow = rows.filter({ hasText: 'Cacher les commentaires' });
  await hideRow.getByRole('switch').click();
  await page.waitForSelector('#comments', { state: 'visible', timeout: 2000 });
  assert(await textBig(), 'désactiver un changement a désactivé l’autre');
  await panel.getByRole('tab', { name: 'Modifications (1/2)', exact: true }).waitFor();
  await page.reload({ waitUntil: 'load' });
  assert(!(await commentsHidden()) && (await textBig()), 'rejeu incorrect après reload');
});

await check('liste : le prompt d’origine est visible dans le détail', async () => {
  await panel.getByRole('button', { name: 'Texte plus grand' }).click();
  await panel.getByText('Prompt d’origine').waitFor({ timeout: 2000 });
});

await check('supprimer un changement garde les autres', async () => {
  const rows = panel.getByTestId('rules').locator('li');
  await rows
    .filter({ hasText: 'Texte plus grand' })
    .getByRole('button', { name: 'Supprimer cette modification' })
    .click();
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('main p')!).fontSize !== '30px',
    null,
    { timeout: 2000 },
  );
  // La liste se met à jour via storage.onChanged : attendre que la ligne disparaisse.
  await rows.nth(1).waitFor({ state: 'detached', timeout: 2000 });
  assert((await rows.count()) === 1, 'mauvaise règle supprimée');
  assert(
    (await rows.first().textContent())?.includes('Cacher les commentaires'),
    'mauvaise règle supprimée',
  );
});

await context.close();
server.close();
done();
