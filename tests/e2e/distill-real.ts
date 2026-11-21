// Contrôle manuel (réseau requis) : taille et durée de la distillation sur de vraies pages.
// Usage : node tests/e2e/distill-real.ts [url...]
import { launch } from './harness.ts';

const urls = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'https://en.wikipedia.org/wiki/Golden_ratio',
      'https://news.ycombinator.com/',
      'https://github.com/microsoft/TypeScript',
    ];
const { context, extensionId } = await launch();
const panel = await context.newPage();
await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html`);
for (const url of urls) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: 'load' });
  const result = await panel.evaluate(async (u) => {
    const [tab] = await chrome.tabs.query({ url: u.split('#')[0] + '*' });
    const t0 = performance.now();
    const reply = await chrome.tabs.sendMessage(tab!.id!, {
      type: 'distill',
      payload: { include: [] },
    });
    return { ms: Math.round(performance.now() - t0), reply };
  }, url);
  const d = result.reply.data;
  console.log(
    `${url}\n  régions=${d.regionCount} chars=${d.regions.length} (~${Math.round((d.regions.length + d.typography.length) / 4)} tokens) ${result.ms} ms`,
  );
  console.log(
    d.regions
      .split('\n')
      .slice(0, 6)
      .map((l: string) => '    ' + l.slice(0, 150))
      .join('\n'),
  );
  await page.close();
}
await context.close();
