// Phase 7 : raccourcis vers des pages enfouies (mode enregistrement), via la vraie UI du panel.
import { assert, check, done, launch, startServer } from './harness.ts';

const html = (title: string, body: string) =>
  `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;

const { server, origin } = await startServer({
  '/': html('Accueil', '<a id="next" href="/docs">Documentation</a>'),
  '/docs': html('Documentation', '<a id="next" href="/docs/deep">Aller plus loin</a>'),
  '/docs/deep': html('Page enfouie', '<p>Tout au fond.</p>'),
});
// Un 2e host qui pointe sur le même serveur, pour vérifier que les raccourcis sont rangés par site.
const OTHER = 'autre.test';
const { context, worker, extensionId } = await launch([
  `--host-resolver-rules=MAP ${OTHER} 127.0.0.1`,
]);
const ext = (path: string) => `chrome-extension://${extensionId}/${path}`;
const HOST = '127.0.0.1';

type Stored = { shortcuts: { id: string; label: string; url: string }[] } | undefined;
const stored = async () =>
  (await worker.evaluate((k) => chrome.storage.local.get(k), `shortcuts:${HOST}`))[
    `shortcuts:${HOST}`
  ] as Stored;
const recording = async () =>
  (await worker.evaluate(() => chrome.storage.session.get('shortcutRecording')))
    .shortcutRecording as { tabId: number; host: string } | undefined;

console.log('Phase 7');

const site = await context.newPage();
await site.goto(origin);
const tabId = await worker.evaluate(
  async (url) => (await chrome.tabs.query({ url: url + '/*' }))[0]!.id!,
  origin,
);
const openPanel = async () => {
  const p = await context.newPage();
  await p.goto(ext(`src/panel/index.html?tabId=${tabId}`));
  return p;
};
let panel = await openPanel();
const bar = () => panel.getByTestId('recording-bar');
const shortcutsTab = () => panel.getByRole('tab', { name: /^Shortcuts \(/ });
const createButton = () => panel.getByRole('button', { name: 'Create a shortcut' });
const thisPage = () => panel.getByRole('button', { name: 'This is the page' });
const emptyState = () => panel.getByText('No shortcuts on this site.', { exact: false });

await check('7.1 « Créer un raccourci » lance l’enregistrement', async () => {
  await panel.getByTestId('host').filter({ hasText: HOST }).waitFor();
  await shortcutsTab().click();
  await emptyState().waitFor();
  await createButton().click();
  await bar().waitFor({ timeout: 3000 });
  const rec = await recording();
  assert(rec?.tabId === tabId && rec.host === HOST, `enregistrement : ${JSON.stringify(rec)}`);
  assert(
    await createButton().isDisabled(),
    'le bouton doit être désactivé pendant l’enregistrement',
  );
});

await check('7.2 naviguer, puis « C’est cette page » enregistre la page', async () => {
  // On quitte l'onglet Raccourcis : l'enregistrement doit y ramener tout seul.
  await panel.getByRole('tab', { name: 'Edit', exact: true }).click();
  await site.click('#next');
  await site.waitForURL(`${origin}/docs`);
  await site.click('#next');
  await site.waitForURL(`${origin}/docs/deep`);
  await panel.getByTestId('recording-page').filter({ hasText: 'Page enfouie' }).waitFor({
    timeout: 3000,
  });
  await thisPage().click();
  await bar().waitFor({ state: 'detached', timeout: 3000 });
  const saved = await stored();
  assert(
    saved?.shortcuts.length === 1 &&
      saved.shortcuts[0]!.url === `${origin}/docs/deep` &&
      saved.shortcuts[0]!.label === 'Page enfouie',
    `stockage : ${JSON.stringify(saved)}`,
  );
  assert(!(await recording()), 'l’enregistrement doit être vidé');
  await panel.getByTestId('shortcut').filter({ hasText: 'Page enfouie' }).waitFor();
  await panel.getByRole('tab', { name: 'Shortcuts (1)' }).waitFor();
});

await check('7.3 un clic sur le raccourci ramène à la page', async () => {
  await site.goto(origin);
  await panel.getByTestId('shortcut').getByRole('link').click();
  await site.waitForURL(`${origin}/docs/deep`, { timeout: 3000 });
  // Limité au raccourci : le panel ReFace affiche aussi « Page actuelle » en en-tête.
  await panel.getByTestId('shortcut').getByText('current page').waitFor({ timeout: 3000 });
});

await check('7.4 un doublon est signalé et rien n’est ajouté', async () => {
  await createButton().click();
  await bar().getByText('This shortcut already exists.').waitFor({ timeout: 3000 });
  assert(await thisPage().isDisabled(), '« C’est cette page » doit être désactivé');
  await bar().getByRole('button', { name: 'Cancel' }).click();
  await bar().waitFor({ state: 'detached' });
  assert((await stored())?.shortcuts.length === 1, 'doublon enregistré');
});

await check('7.5 renommer puis supprimer', async () => {
  await panel.getByRole('button', { name: 'Rename this shortcut' }).click();
  await panel.getByLabel('Shortcut name').fill('Mon raccourci');
  await panel.getByLabel('Shortcut name').press('Enter');
  await panel.getByTestId('shortcut').filter({ hasText: 'Mon raccourci' }).waitFor();
  assert((await stored())?.shortcuts[0]?.label === 'Mon raccourci', 'nom non enregistré');
  await panel.getByRole('button', { name: 'Delete this shortcut' }).click();
  await emptyState().waitFor();
  assert(!(await stored()), 'la clé du site doit disparaître');
});

await check('7.6 annuler n’enregistre rien', async () => {
  await site.goto(origin);
  await createButton().click();
  await bar().waitFor();
  await site.click('#next');
  await site.waitForURL(`${origin}/docs`);
  await bar().getByRole('button', { name: 'Cancel' }).click();
  await bar().waitFor({ state: 'detached' });
  assert(!(await stored()) && !(await recording()), 'rien ne doit être enregistré');
});

await check('7.7 l’enregistrement survit à la fermeture du panel', async () => {
  await createButton().click();
  await bar().waitFor();
  await panel.close();
  panel = await openPanel();
  await bar().waitFor({ timeout: 3000 });
  await panel.getByTestId('recording-page').filter({ hasText: 'Documentation' }).waitFor();
  await thisPage().click();
  await bar().waitFor({ state: 'detached', timeout: 3000 });
  assert((await stored())?.shortcuts[0]?.url === `${origin}/docs`, 'raccourci non enregistré');
});

await check('7.8 les raccourcis sont propres à chaque site', async () => {
  await site.goto(`http://${OTHER}:${new URL(origin).port}/`);
  await panel.getByTestId('host').filter({ hasText: OTHER }).waitFor({ timeout: 3000 });
  await shortcutsTab().click();
  await emptyState().waitFor();
  await panel.getByRole('tab', { name: 'Shortcuts (0)' }).waitFor();
  await site.goto(origin);
  await panel.getByTestId('host').filter({ hasText: HOST }).waitFor({ timeout: 3000 });
  await panel.getByRole('tab', { name: 'Shortcuts (1)' }).waitFor();
});

await context.close();
server.close();
done();
