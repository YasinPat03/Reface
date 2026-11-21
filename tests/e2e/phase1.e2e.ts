// Phase 0/1 : messagerie de bout en bout, rejeu au document_start, mises à jour live, pause.
import { assert, check, done, launch, startServer } from './harness.ts';

const RED = 'rgb(255, 0, 0)';
const BLUE = 'rgb(0, 0, 255)';

// Page servie en deux temps : le <body> arrive 400 ms après le <head>.
// Le premier rAF du <body> mesure la couleur au tout premier paint (détection du FOUC).
const slowPage = (res: import('node:http').ServerResponse) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.write(
    '<!doctype html><html><head><title>t</title><style>h1{color:rgb(0,128,0)}</style></head>',
  );
  setTimeout(() => {
    res.end(`<body><h1 id="t">Titre</h1><script>
      requestAnimationFrame(() => { window.__firstPaintColor = getComputedStyle(document.getElementById('t')).color; });
    </script></body></html>`);
  }, 400);
};

const { server, origin } = await startServer({ '/': slowPage });
const { context, worker, extensionId } = await launch();
const host = '127.0.0.1';
const setStorage = (items: Record<string, unknown>) =>
  worker.evaluate((i) => chrome.storage.local.set(i), items);
const removeStorage = (k: string[]) =>
  worker.evaluate((keys) => chrome.storage.local.remove(keys), k);

console.log('Phase 0/1');
const page = await context.newPage();
await page.goto(origin);

await check('0.4 ping panel → SW → content', async () => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html`);
  const result = await panel.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url: url + '/*' });
    return chrome.runtime.sendMessage({ type: 'ping', payload: { tabId: tab!.id } });
  }, origin);
  await panel.close();
  assert(
    result?.ok && result.data.content === 'ok',
    `réponse inattendue : ${JSON.stringify(result)}`,
  );
  assert(result.data.host === host, `hôte inattendu : ${result.data.host}`);
});

await setStorage({ [`css:${host}`]: `h1{color:${RED}!important}` });

await check('1.1 CSS appliqué dès le premier paint après reload (pas de FOUC)', async () => {
  await page.reload();
  await page.waitForFunction(() => '__firstPaintColor' in window);
  const first = await page.evaluate(
    () => (window as unknown as { __firstPaintColor: string }).__firstPaintColor,
  );
  assert(first === RED, `couleur au premier paint : ${first}`);
  const inHtml = await page.evaluate(
    () => document.getElementById('bp-styles')?.parentElement?.tagName,
  );
  assert(inHtml === 'HTML', `parent du <style> : ${inHtml}`);
});

await check('1.1 FOUC : toujours vert avec CPU ralenti ×4', async () => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.reload();
  await page.waitForFunction(() => '__firstPaintColor' in window);
  const first = await page.evaluate(
    () => (window as unknown as { __firstPaintColor: string }).__firstPaintColor,
  );
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  assert(first === RED, `couleur au premier paint : ${first}`);
});

const h1Color = () => page.evaluate(() => getComputedStyle(document.getElementById('t')!).color);

await check('1.2 mise à jour live sans reload', async () => {
  await setStorage({ [`css:${host}`]: `h1{color:${BLUE}!important}` });
  await page.waitForFunction(
    (c) => getComputedStyle(document.getElementById('t')!).color === c,
    BLUE,
    { timeout: 2000 },
  );
});

await check('1.1 pause : le style est retiré en live, puis restauré', async () => {
  await setStorage({ [`paused:${host}`]: true });
  await page.waitForFunction(
    () => getComputedStyle(document.getElementById('t')!).color === 'rgb(0, 128, 0)',
    null,
    { timeout: 2000 },
  );
  await removeStorage([`paused:${host}`]);
  await page.waitForFunction(
    (c) => getComputedStyle(document.getElementById('t')!).color === c,
    BLUE,
    { timeout: 2000 },
  );
});

await check('1.1 pause respectée au chargement', async () => {
  await setStorage({ [`paused:${host}`]: true });
  await page.reload();
  await page.waitForLoadState('load');
  assert((await h1Color()) === 'rgb(0, 128, 0)', `couleur : ${await h1Color()}`);
  await removeStorage([`paused:${host}`]);
});

await check('1.1 aucun <style> injecté quand il n’y a pas de règles', async () => {
  await removeStorage([`css:${host}`]);
  await page.reload();
  await page.waitForLoadState('load');
  assert(!(await page.evaluate(() => document.getElementById('bp-styles'))), '<style> présent');
});

await check('1.3 une règle « hide » compilée est rejouée au reload', async () => {
  await setStorage({ [`css:${host}`]: '#t{display:none!important}' });
  await page.reload();
  await page.waitForLoadState('load');
  assert(!(await page.isVisible('#t')), 'le titre devrait être caché');
});

await check('1.5 règles par section : suivies lors d’une navigation SPA (pushState)', async () => {
  // Règle limitée à la section « home » (page /), et une autre à tout le site.
  await setStorage({
    [`css:${host}`]: { home: `#t{color:${RED}!important}`, '*': 'body{margin:3px!important}' },
  });
  await page.goto(origin);
  await page.waitForFunction(
    (c) => getComputedStyle(document.getElementById('t')!).color === c,
    RED,
  );
  await page.evaluate(() => history.pushState({}, '', '/watch?v=1'));
  await page.waitForFunction(
    () => getComputedStyle(document.getElementById('t')!).color === 'rgb(0, 128, 0)',
    null,
    { timeout: 3000 },
  );
  assert(
    (await page.evaluate(() => getComputedStyle(document.body).margin)) === '3px',
    'la règle « tout le site » doit rester',
  );
  await page.evaluate(() => history.back());
  await page.waitForFunction(
    (c) => getComputedStyle(document.getElementById('t')!).color === c,
    RED,
    {
      timeout: 3000,
    },
  );
});

await context.close();
server.close();
done();
