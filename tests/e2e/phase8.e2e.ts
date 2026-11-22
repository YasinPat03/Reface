// Phase 8 : raccourci clavier ⌘⇧E, pour enregistrer un raccourci sans ouvrir le panel.
// Les touches simulées par Playwright n'atteignent pas les commandes d'extension (vérifié) :
// on contrôle que la touche est bien attribuée par Chrome (8.1), puis on déclenche exactement
// le même code que la touche via __bpShortcutHotkey, exposé par le service worker.
import { assert, check, done, launch, startServer } from './harness.ts';

const html = (title: string, body: string) =>
  `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;

const { server, origin } = await startServer({
  '/': html('Accueil', '<a id="next" href="/docs">Documentation</a>'),
  '/docs': html('Documentation', '<a id="next" href="/docs/deep">Aller plus loin</a>'),
  '/docs/deep': html('Page enfouie', '<p>Tout au fond.</p>'),
});
const { context, worker, extensionId } = await launch();
const ext = (path: string) => `chrome-extension://${extensionId}/${path}`;
const HOST = '127.0.0.1';
const EXPECTED_KEY = process.platform === 'darwin' ? '⇧⌘E' : 'Ctrl+Shift+E';

type Stored = { shortcuts: { label: string; url: string }[] } | undefined;
const stored = async () =>
  (await worker.evaluate((k) => chrome.storage.local.get(k), `shortcuts:${HOST}`))[
    `shortcuts:${HOST}`
  ] as Stored;
const recording = async () =>
  (await worker.evaluate(() => chrome.storage.session.get('shortcutRecording')))
    .shortcutRecording as { tabId: number; host: string } | undefined;
const badge = (tabId: number) =>
  worker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
/** Équivalent de ⌘⇧E sur l'onglet. */
const pressHotkey = (tabId: number) =>
  worker.evaluate(
    (id) =>
      (
        globalThis as unknown as { __bpShortcutHotkey: (tabId: number) => Promise<void> }
      ).__bpShortcutHotkey(id),
    tabId,
  );

async function until(fn: () => Promise<boolean>, what: string, timeout = 3000): Promise<void> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error(`délai dépassé : ${what}`);
}

console.log('Phase 8');

const site = await context.newPage();
await site.goto(origin);
const tabId = await worker.evaluate(
  async (url) => (await chrome.tabs.query({ url: url + '/*' }))[0]!.id!,
  origin,
);
const pill = (state?: 'recording' | 'toast') =>
  site.locator(state ? `[data-bp-shortcut][data-state="${state}"]` : '[data-bp-shortcut]');

await check('8.1 la touche ⌘⇧E est attribuée par Chrome (aucun conflit)', async () => {
  const commands = await worker.evaluate(() => chrome.commands.getAll());
  const command = commands.find((c) => c.name === 'record-shortcut');
  assert(command?.shortcut === EXPECTED_KEY, `commande : ${JSON.stringify(command)}`);
});

await check('8.2 1re pression : enregistrement, pastille et badge REC', async () => {
  await pressHotkey(tabId);
  await pill('recording').waitFor({ timeout: 3000 });
  await pill().getByText(`Shortcut for ${HOST}`).waitFor();
  await pill().getByText(EXPECTED_KEY, { exact: false }).waitFor();
  const rec = await recording();
  assert(rec?.tabId === tabId && rec.host === HOST, `enregistrement : ${JSON.stringify(rec)}`);
  await until(async () => (await badge(tabId)) === 'REC', 'badge REC');
});

await check('8.3 la pastille et le badge suivent la navigation', async () => {
  await site.click('#next');
  await site.waitForURL(`${origin}/docs`);
  await site.click('#next');
  await site.waitForURL(`${origin}/docs/deep`);
  await pill('recording').waitFor({ timeout: 3000 });
  await until(async () => (await badge(tabId)) === 'REC', 'badge REC après navigation');
});

await check('8.4 2e pression : la page est enregistrée, toast puis disparition', async () => {
  await pressHotkey(tabId);
  await pill('toast').getByText('Shortcut "Page enfouie" saved').waitFor({ timeout: 3000 });
  const saved = await stored();
  assert(
    saved?.shortcuts.length === 1 &&
      saved.shortcuts[0]!.url === `${origin}/docs/deep` &&
      saved.shortcuts[0]!.label === 'Page enfouie',
    `stockage : ${JSON.stringify(saved)}`,
  );
  assert(!(await recording()), 'l’enregistrement doit être vidé');
  await pill().waitFor({ state: 'detached', timeout: 4000 });
  await until(async () => (await badge(tabId)) === '', 'badge vidé');
});

const panel = await context.newPage();
await panel.goto(ext(`src/panel/index.html?tabId=${tabId}`));
await site.bringToFront();

await check('8.5 le raccourci apparaît dans le panel, avec l’astuce de la touche', async () => {
  await panel.getByRole('tab', { name: 'Shortcuts (1)' }).click();
  await panel.getByTestId('shortcut').filter({ hasText: 'Page enfouie' }).waitFor();
  await panel.getByTestId('hotkey-hint').filter({ hasText: EXPECTED_KEY }).waitFor();
});

await check('8.6 boutons de la pastille : annuler, puis « Enregistrer cette page »', async () => {
  await site.goto(origin);
  await pressHotkey(tabId);
  await pill('recording').waitFor({ timeout: 3000 });
  await site.getByRole('button', { name: 'Cancel recording' }).click();
  await pill().waitFor({ state: 'detached', timeout: 3000 });
  assert(!(await recording()), 'annulation non prise en compte');

  await pressHotkey(tabId);
  await pill('recording').waitFor({ timeout: 3000 });
  await site.click('#next');
  await site.waitForURL(`${origin}/docs`);
  await site.getByRole('button', { name: 'Save this page' }).click();
  await pill('toast').getByText('Shortcut "Documentation" saved').waitFor({
    timeout: 3000,
  });
  assert((await stored())?.shortcuts.length === 2, 'page non enregistrée');
});

await check('8.7 doublon : signalé, l’enregistrement continue', async () => {
  await pill().waitFor({ state: 'detached', timeout: 4000 });
  await pressHotkey(tabId); // démarre sur /docs
  await pill('recording').waitFor({ timeout: 3000 });
  await pressHotkey(tabId); // /docs est déjà un raccourci
  await pill('toast').getByText('This shortcut already exists', { exact: false }).waitFor({
    timeout: 3000,
  });
  assert((await stored())?.shortcuts.length === 2, 'doublon enregistré');
  assert((await recording())?.tabId === tabId, 'l’enregistrement doit continuer');
  await pill('recording').waitFor({ timeout: 4000 });
});

await check(
  '8.8 synchro avec le panel : « Annuler » dans le panel retire la pastille',
  async () => {
    await panel.getByTestId('recording-bar').waitFor({ timeout: 3000 });
    await panel.getByTestId('recording-bar').getByRole('button', { name: 'Cancel' }).click();
    await pill().waitFor({ state: 'detached', timeout: 3000 });
    await until(async () => (await badge(tabId)) === '', 'badge vidé');
  },
);

await check('8.9 page non web : rien n’est enregistré', async () => {
  await site.goto('about:blank');
  await pressHotkey(tabId);
  assert(!(await recording()), 'aucun enregistrement attendu sur about:blank');
});

await context.close();
server.close();
done();
