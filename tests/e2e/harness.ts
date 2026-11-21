// Harnais E2E : Chromium + extension non empaquetée (dist/) + petit serveur local de pages de test.
import { chromium, type BrowserContext, type Worker } from 'playwright';
import { createServer, type Server } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const DIST = resolve(import.meta.dirname, '../../dist');

export type Pages = Record<string, string | ((res: import('node:http').ServerResponse) => void)>;

export async function startServer(pages: Pages): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    const page = pages[req.url ?? '/'];
    if (!page) return void res.writeHead(404).end('not found');
    if (typeof page === 'function') return page(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('adresse serveur inattendue');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

export async function launch(): Promise<{
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
}> {
  const profile = await mkdtemp(join(tmpdir(), 'bp-e2e-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: process.env.HEADED !== '1',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  return { context, worker, extensionId };
}

let failures = 0;
export async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures++;
    console.log(`  ✗ ${name}\n    ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function done(): void {
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert.');
  process.exit(failures ? 1 : 0);
}
