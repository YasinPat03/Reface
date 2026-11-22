// Phase 13 : présentation du premier lancement (logo au centre, puis visite guidée du panneau).
import { assert, check, done, launch, startServer } from './harness.ts';
import { TOUR_STEPS, stepDuration } from '../../src/panel/onboarding/steps.ts';

const KEY = 'onboarding:v1';
const { server, origin } = await startServer({
  '/': '<!doctype html><html><head><title>Accueil</title></head><body><p>Bonjour.</p></body></html>',
});
// Profil neuf, sans marquer la présentation comme vue.
const { context, worker, extensionId } = await launch([], { onboarding: true });
const ext = (path: string) => `chrome-extension://${extensionId}/${path}`;
const seen = async () =>
  (await worker.evaluate((k) => chrome.storage.local.get(k), KEY))[KEY] as
    { seenAt: string } | undefined;
const reset = () => worker.evaluate((k) => chrome.storage.local.remove(k), KEY);

console.log('Phase 13');

const site = await context.newPage();
await site.goto(origin);
const tabId = await worker.evaluate(
  async (url) => (await chrome.tabs.query({ url: url + '/*' }))[0]!.id!,
  origin,
);
let panel = await context.newPage();
await panel.setViewportSize({ width: 360, height: 700 });
await panel.goto(ext(`src/panel/index.html?tabId=${tabId}`));

const overlay = () => panel.getByTestId('onboarding');
const bubble = () => panel.getByTestId('tour-bubble');
const progress = () => panel.getByTestId('tour-progress');
const spotlightTarget = () =>
  panel.getByTestId('tour-spotlight').getAttribute('data-target', { timeout: 2000 });
const waitTour = () =>
  panel.locator('[data-testid=onboarding][data-phase=tour]').waitFor({ timeout: 8000 });
const waitGone = () => overlay().waitFor({ state: 'detached', timeout: 3000 });

await check('13.1 profil neuf : le logo se joue en grand, au centre', async () => {
  await panel.locator('[data-testid=onboarding][data-phase=intro]').waitFor({ timeout: 3000 });
  await panel.locator('.brand-intro').waitFor();
  await panel.getByText('Une page à votre mesure.').waitFor();
  const logo = (await panel.locator('.onboarding-logo').boundingBox())!;
  const center = logo.x + logo.width / 2;
  assert(Math.abs(center - 180) < 4, `logo pas centré (${center})`);
  assert(logo.y > 150, `logo trop haut (${logo.y})`);
  assert(
    (await panel.locator('main.app-shell').getAttribute('inert')) !== null,
    'panneau non inerte',
  );
});

await check('13.2 la visite commence d’elle-même sur la 1re zone', async () => {
  await waitTour();
  await bubble().getByText(TOUR_STEPS[0]!.title).waitFor();
  assert((await spotlightTarget()) === TOUR_STEPS[0]!.target, 'projecteur mal placé');
  await panel.getByTestId('tour-cursor').waitFor();
});

await check(
  '13.3 → parcourt chaque zone dans l’ordre, la bulle reste dans le panneau',
  async () => {
    for (const [i, step] of TOUR_STEPS.entries()) {
      if (i > 0) await panel.keyboard.press('ArrowRight');
      await progress()
        .filter({ hasText: `${i + 1} / ${TOUR_STEPS.length}` })
        .waitFor({ timeout: 2000 });
      assert((await spotlightTarget()) === step.target, `étape ${i + 1} : mauvaise cible`);
      const target = panel.locator(`[data-tour="${step.target}"]`);
      assert((await target.count()) === 1, `cible absente ou multiple : ${step.target}`);
      await bubble().getByText(step.title, { exact: true }).waitFor();
      await panel.waitForTimeout(800); // fin du trajet du curseur et de la bulle
      const box = (await bubble().boundingBox())!;
      assert(box.x >= 15 && box.x + box.width <= 345, `étape ${i + 1} : bulle hors écran (x)`);
      assert(box.y >= 15 && box.y + box.height <= 685, `étape ${i + 1} : bulle hors écran (y)`);
      const spot = (await panel.getByTestId('tour-spotlight').boundingBox())!;
      const zone = (await target.boundingBox())!;
      assert(
        spot.x <= zone.x + 1 &&
          spot.y <= zone.y + 1 &&
          spot.x + spot.width >= zone.x + zone.width - 1,
        `étape ${i + 1} : le projecteur ne couvre pas la zone`,
      );
    }
  },
);

await check('13.4 la bulle de fin ferme la visite et la marque comme vue', async () => {
  await panel.keyboard.press('ArrowRight');
  await bubble().getByText('C’est parti').waitFor();
  assert(!(await seen()), 'clé écrite trop tôt');
  await panel.getByRole('button', { name: 'Commencer' }).click();
  await waitGone();
  assert((await seen())?.seenAt, 'clé non écrite');
  assert((await panel.locator('main.app-shell').getAttribute('inert')) === null, 'panneau inerte');
});

await check('13.5 elle ne revient pas à la réouverture du panneau', async () => {
  await panel.reload();
  await panel.getByTestId('host').filter({ hasText: '127.0.0.1' }).waitFor();
  await panel.waitForTimeout(1500);
  assert((await overlay().count()) === 0, 'la présentation s’est rejouée');
});

await check('13.6 « Revoir la présentation » (Options) la relance', async () => {
  await panel.getByRole('button', { name: 'Options' }).click();
  await panel.getByRole('button', { name: 'Revoir la présentation' }).click();
  await panel.locator('[data-testid=onboarding][data-phase=intro]').waitFor({ timeout: 3000 });
  assert(!(await panel.locator('#panel-options').isVisible()), 'les options restent ouvertes');
});

await check('13.7 la visite avance seule, puis Échap la ferme', async () => {
  await panel.locator('[data-testid=onboarding]').click(); // un clic écourte l'intro
  await waitTour();
  await progress()
    .filter({ hasText: `2 / ${TOUR_STEPS.length}` })
    .waitFor({
      timeout: stepDuration(TOUR_STEPS[0]!) + 1500,
    });
  await panel.keyboard.press('Escape');
  await waitGone();
  assert((await seen())?.seenAt, 'clé non écrite après Échap');
});

await check('13.8 « Passer » ferme la visite', async () => {
  await reset();
  await waitTour();
  await panel.getByRole('button', { name: 'Passer', exact: true }).click();
  await waitGone();
  assert((await seen())?.seenAt, 'clé non écrite après Passer');
});

await check(
  '13.9 sans page web : un site fictif pendant la visite, puis la page vide',
  async () => {
    await reset();
    panel = await context.newPage();
    await panel.setViewportSize({ width: 360, height: 700 });
    await panel.goto(ext('src/panel/index.html')); // l'onglet actif est le panneau lui-même
    await panel.getByTestId('host').filter({ hasText: 'exemple.com' }).waitFor({ timeout: 3000 });
    await panel.getByRole('button', { name: 'Passer la présentation' }).click();
    await waitGone();
    await panel.getByText('Ouvrez une page web (http ou https) pour la modifier.').waitFor();
  },
);

await context.close();
server.close();
done();
