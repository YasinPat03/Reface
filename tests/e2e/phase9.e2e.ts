// Phase 9 : palette ⌘⇧X, la liste des raccourcis du site au centre de la page.
// Les touches simulées par Playwright n'atteignent pas les commandes d'extension (vérifié en phase 8) :
// on contrôle que la touche est attribuée (9.1), puis on ouvre la palette avec le même code que la
// touche, via __bpShortcutPalette (SW). Dans la palette, les touches sont tapées pour de vrai.
import { assert, check, done, launch, startServer } from './harness.ts';

const html = (title: string, body: string) =>
  `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;

const { server, origin } = await startServer({
  // Compteur de touches côté page : elles ne doivent pas lui parvenir quand la palette est ouverte.
  '/': html(
    'Accueil',
    '<p>Accueil</p><script>window.__keys = 0; window.addEventListener("keydown", () => window.__keys++);</script>',
  ),
  '/a': html('Page A', '<p>A</p>'),
  '/b': html('Page B', '<p>B</p>'),
  '/c': html('Page C', '<p>C</p>'),
});
const OTHER = 'autre.test';
const { context, worker } = await launch([`--host-resolver-rules=MAP ${OTHER} 127.0.0.1`]);
const HOST = '127.0.0.1';
const MAC = process.platform === 'darwin';
const PALETTE_KEY = MAC ? '⇧⌘X' : 'Ctrl+Shift+X';
const RECORD_KEY = MAC ? '⇧⌘E' : 'Ctrl+Shift+E';
const MOD = MAC ? 'Meta' : 'Control';

const shortcuts = ['a', 'b', 'c'].map((p) => ({
  id: `s_${p}`,
  label: `Page ${p.toUpperCase()}`,
  url: `${origin}/${p}`,
  createdAt: '2026-11-21T10:00:00.000Z',
}));
await worker.evaluate(({ key, value }) => chrome.storage.local.set({ [key]: value }), {
  key: `shortcuts:${HOST}`,
  value: { host: HOST, shortcuts },
});

console.log('Phase 9');

const site = await context.newPage();
await site.goto(origin);
const tabId = await worker.evaluate(
  async (url) => (await chrome.tabs.query({ url: url + '/*' }))[0]!.id!,
  origin,
);
/** Équivalent de ⌘⇧X sur l'onglet. */
const togglePalette = () =>
  worker.evaluate(
    (id) =>
      (
        globalThis as unknown as { __bpShortcutPalette: (tabId: number) => Promise<void> }
      ).__bpShortcutPalette(id),
    tabId,
  );
const palette = () => site.locator('[data-bp-palette] dialog[open]');
const options = () => site.locator('[data-bp-palette] [role="option"]');
const selected = () =>
  site.locator('[data-bp-palette] [role="option"][aria-selected="true"] .label').textContent();
const openPalette = async () => {
  await togglePalette();
  await palette().waitFor({ timeout: 3000 });
};
const closed = () =>
  site.locator('[data-bp-palette]').waitFor({ state: 'detached', timeout: 3000 });

await check('9.1 la touche ⌘⇧X est attribuée par Chrome (aucun conflit)', async () => {
  const commands = await worker.evaluate(() => chrome.commands.getAll());
  const command = commands.find((c) => c.name === 'open-shortcuts');
  assert(command?.shortcut === PALETTE_KEY, `commande : ${JSON.stringify(command)}`);
});

await check(
  '9.2 ouverture : raccourcis du site, 1er sélectionné, focus dans la palette',
  async () => {
    await openPalette();
    await palette().locator('.site').filter({ hasText: HOST }).waitFor();
    assert((await options().count()) === 3, `options : ${await options().count()}`);
    assert((await selected()) === 'Page A', `sélection : ${await selected()}`);
    const focused = await site.evaluate(
      () => document.activeElement?.hasAttribute('data-bp-palette') ?? false,
    );
    assert(focused, 'le focus doit être dans la palette');
    await palette().locator('footer').filter({ hasText: PALETTE_KEY }).waitFor();
  },
);

await check('9.3 ↑ ↓ en boucle, Début et Fin', async () => {
  await site.keyboard.press('ArrowDown');
  await site.keyboard.press('ArrowDown');
  assert((await selected()) === 'Page C', `↓↓ : ${await selected()}`);
  await site.keyboard.press('ArrowDown');
  assert((await selected()) === 'Page A', `↓ en bout de liste : ${await selected()}`);
  await site.keyboard.press('ArrowUp');
  assert((await selected()) === 'Page C', `↑ en haut de liste : ${await selected()}`);
  await site.keyboard.press('Home');
  assert((await selected()) === 'Page A', `Début : ${await selected()}`);
  await site.keyboard.press('End');
  assert((await selected()) === 'Page C', `Fin : ${await selected()}`);
});

await check('9.4 les touches ne parviennent pas à la page', async () => {
  const keys = await site.evaluate(() => (window as unknown as { __keys: number }).__keys);
  assert(keys === 0, `${keys} touche(s) reçue(s) par la page`);
});

await check('9.5 Entrée ouvre le raccourci sélectionné dans l’onglet', async () => {
  await site.keyboard.press('Home');
  await site.keyboard.press('ArrowDown');
  await site.keyboard.press('Enter');
  await site.waitForURL(`${origin}/b`, { timeout: 3000 });
});

await check('9.6 fermer : ⌘⇧X à nouveau, Échap, clic sur le fond', async () => {
  await site.goto(origin);
  await openPalette();
  await togglePalette();
  await closed();
  await openPalette();
  await site.keyboard.press('Escape');
  await closed();
  await openPalette();
  await site.mouse.click(5, 5);
  await closed();
});

await check('9.7 un clic sur un raccourci l’ouvre', async () => {
  await openPalette();
  await options().nth(2).click();
  await site.waitForURL(`${origin}/c`, { timeout: 3000 });
});

await check('9.8 ⌘/Ctrl+Entrée ouvre un nouvel onglet, sans bouger celui-ci', async () => {
  await site.goto(origin);
  await openPalette();
  await site.keyboard.press('ArrowDown');
  const [opened] = await Promise.all([
    context.waitForEvent('page', { timeout: 3000 }),
    site.keyboard.press(`${MOD}+Enter`),
  ]);
  await opened.waitForURL(`${origin}/b`, { timeout: 3000 });
  assert(site.url() === `${origin}/`, `l’onglet a bougé : ${site.url()}`);
  await closed();
  await opened.close();
});

await check('9.9 autre site sans raccourci : message et touche d’enregistrement', async () => {
  await site.goto(`http://${OTHER}:${new URL(origin).port}/`);
  await openPalette();
  await palette().getByText(`No shortcuts for ${OTHER}.`, { exact: false }).waitFor();
  await palette().locator('kbd').filter({ hasText: RECORD_KEY }).waitFor();
  assert((await options().count()) === 0, 'aucune option attendue');
  await site.keyboard.press('Escape');
  await closed();
});

await check('9.10 page non web : pas de palette, badge « ✕ »', async () => {
  await site.goto('about:blank');
  await togglePalette();
  assert((await site.locator('[data-bp-palette]').count()) === 0, 'palette inattendue');
  const badge = await worker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
  assert(badge === '✕', `badge : ${badge}`);
});

await context.close();
server.close();
done();
