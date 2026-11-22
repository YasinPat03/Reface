// Phase 12 : affinage visuel (toujours actif). Après la v1, le LLM reçoit une capture de sa
// preview et peut renvoyer une v2 ; elle n'est retenue que si elle passe les garde-fous.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { UNKNOWN_PAGE } from './fixtures/unknownForum.ts';
import { assert, check, done, isRefineRequest, launch, startServer } from './harness.ts';

const THEME = {
  inspiredBy: '',
  palette: {
    background: '#f6f9fc',
    surface: '#ffffff',
    text: '#0a2540',
    muted: '#425466',
    accent: '#6159fa',
    header: '#0a2540',
    onHeader: '#ffffff',
    border: '#e3e8ee',
  },
  typography: { fontFamily: 'system-ui', baseSize: 14, scale: 1.3, titleWeight: 600 },
  shape: { radius: 10, shadow: '0 2px 5px rgba(50,50,93,.1)' },
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
const v1 = {
  changes: [{ title: 'Cartes', ops: [], targets: [], css: '', theme: THEME }],
  explanation: 'v1',
};
const recipe = (theme: object | null, css = '') => ({
  review: { defects: ['les cartes sont trop étirées'], clean: false },
  changes: [{ title: 'Cartes', ops: [], targets: [], css, theme }],
  explanation: 'v2',
});

const refineRequests: { image: string; request: string }[] = [];

async function llm(req: IncomingMessage, res: ServerResponse) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const messages = (JSON.parse(raw) as { messages: { content: unknown }[] }).messages;
  const user = String(messages[1]!.content);
  const request = user.match(/^User request: (.*)$/m)?.[1] ?? '';
  let answer: object = v1;
  if (isRefineRequest(raw)) {
    const parts = messages.at(-1)!.content as { type: string; image_url?: { url: string } }[];
    refineRequests.push({ image: parts.find((p) => p.image_url)!.image_url!.url, request });
    if (request.includes('améliore'))
      answer = recipe({ ...THEME, layout: { ...THEME.layout, columns: 2 } });
    else if (request.includes('casse'))
      answer = recipe(
        null,
        'td > table > tbody{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}',
      );
    else if (request.includes('propre'))
      answer = { ...recipe(THEME), review: { defects: [], clean: true } };
    else if (request.includes('lent')) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      answer = recipe({ ...THEME, layout: { ...THEME.layout, columns: 3 } });
    }
  }
  res
    .writeHead(200, { 'Content-Type': 'application/json' })
    .end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }));
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

/** Colonnes distinctes occupées par les 4 premiers sujets. */
const columns = () =>
  page.evaluate(
    () =>
      new Set(
        [...document.querySelectorAll('tr.qx-entry')]
          .slice(0, 4)
          .map((row) => Math.round(row.getBoundingClientRect().left)),
      ).size,
  );

async function preview(prompt: string) {
  await panel.getByLabel('What do you want to change?').fill(prompt);
  await panel.getByRole('button', { name: 'Preview' }).click();
  await panel.getByTestId('draft').waitFor({ timeout: 10_000 });
}
const refineDone = () =>
  panel.getByTestId('refining').waitFor({ state: 'detached', timeout: 15_000 });
async function discard() {
  await panel
    .getByRole('button', { name: /Discard|Ignore/ })
    .first()
    .click();
  await panel.getByTestId('draft').waitFor({ state: 'detached', timeout: 5000 });
}

console.log('Phase 12 : affinage visuel');

await check('la v1 s’affiche, puis le LLM reçoit une capture de sa preview', async () => {
  refineRequests.length = 0;
  await preview('cartes améliore');
  await refineDone();
  assert(refineRequests.length === 1, `${refineRequests.length} requête(s) d'affinage`);
  assert(refineRequests[0]!.image.startsWith('data:image/jpeg;base64,'), 'pas de capture JPEG');
  assert(refineRequests[0]!.image.length > 5000, 'capture vide');
});

await check('une v2 meilleure remplace la v1, avec la mention d’affinage', async () => {
  assert(
    (await columns()) === 2,
    `${await columns()} colonne(s) : la v2 (2 colonnes) n'est pas appliquée`,
  );
  await panel.getByTestId('refined').waitFor({ timeout: 2000 });
  const note = await panel.getByTestId('refined').textContent();
  assert(note?.includes('les cartes sont trop étirées'), `défaut non affiché : ${note}`);
  await discard();
});

await check('jugé propre par le LLM : aucune v2 n’est appliquée', async () => {
  refineRequests.length = 0;
  await preview('cartes propre');
  await refineDone();
  assert(refineRequests.length === 1, 'pas de requête d’affinage');
  assert((await columns()) === 1, 'la page a changé alors que le rendu était jugé propre');
  assert(!(await panel.getByTestId('refined').count()), 'mention d’affinage sans affinage');
  await discard();
});

await check('une v2 qui casse la mise en page est écartée : la v1 reste', async () => {
  await preview('cartes casse');
  await refineDone();
  assert((await columns()) === 1, 'la grille cassée de la v2 a été appliquée');
  assert(!(await panel.getByTestId('refined').count()), 'mention d’affinage pour une v2 écartée');
  await discard();
});

await check(
  'Garder pendant l’affinage enregistre la v1 ; la v2 arrivée ensuite est ignorée',
  async () => {
    await preview('cartes lent');
    await panel.getByTestId('refining').waitFor({ timeout: 2000 });
    await panel.getByRole('button', { name: 'Keep' }).click();
    await panel.getByTestId('rules').waitFor({ timeout: 5000 });
    await page.waitForTimeout(3500); // la v2 (3 colonnes) revient pendant ce temps
    const shown = await page.evaluate(
      () => document.getElementById('bp-preview')?.textContent ?? '',
    );
    assert(!shown.includes('repeat(3'), 'la v2 a été appliquée après « Garder »');
    assert(
      (await columns()) === 1,
      `${await columns()} colonnes : la règle gardée n'est pas la v1`,
    );
  },
);

await context.close();
server.close();
done();
