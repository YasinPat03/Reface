// Harnais E2E : Chromium + extension non empaquetée (dist/) + petit serveur local de pages de test.
import { chromium, type BrowserContext, type Worker } from 'playwright';
import { createServer, type Server } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** `BP_DIST` : charger un autre build (ex. une référence figée pendant qu'on modifie `dist/`). */
export const DIST = process.env.BP_DIST
  ? resolve(process.env.BP_DIST)
  : resolve(import.meta.dirname, '../../dist');

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

/**
 * `onboarding: true` garde la présentation du premier lancement. Par défaut, elle est marquée
 * comme vue, pour que les phases qui ne la testent pas trouvent le panneau directement.
 * `preStudy: true` garde la pré-étude des pages à l'ouverture du panel. Par défaut, elle est
 * désactivée : ses appels au LLM fausseraient les comptages des faux LLM.
 */
export async function launch(
  extraArgs: string[] = [],
  { onboarding = false, preStudy = false }: { onboarding?: boolean; preStudy?: boolean } = {},
): Promise<{
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
}> {
  const profile = await mkdtemp(join(tmpdir(), 'bp-e2e-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: process.env.HEADED !== '1',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, ...extraArgs],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  if (!onboarding)
    await worker.evaluate(() => chrome.storage.local.set({ 'onboarding:v1': { seenAt: 'e2e' } }));
  if (!preStudy) await worker.evaluate(() => chrome.storage.local.set({ 'preStudy:v1': false }));
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

/**
 * Requête d'affinage visuel (le dernier message contient une capture). Les faux LLM des phases
 * qui ne testent pas l'affinage y répondent par une erreur : la v1 reste alors telle quelle.
 */
export function isRefineRequest(raw: string): boolean {
  try {
    const messages = (JSON.parse(raw) as { messages?: { content: unknown }[] }).messages ?? [];
    const last = messages.at(-1)?.content;
    return Array.isArray(last) && last.some((p) => (p as { type?: string }).type === 'image_url');
  } catch {
    return false;
  }
}

/** Réponse d'un faux LLM qui décline l'affinage visuel. */
export function declineRefine(res: import('node:http').ServerResponse): void {
  res
    .writeHead(400, { 'Content-Type': 'application/json' })
    .end('{"error":{"message":"refine not supported by this fake"}}');
}

/** Réponse d'un faux LLM qui demande des outils (format OpenAI `tool_calls`). */
export function toolCallReply(
  res: import('node:http').ServerResponse,
  calls: { name: string; args: unknown }[],
): void {
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(
    JSON.stringify({
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: calls.map((call, i) => ({
              id: `call_${Date.now()}_${i}`,
              type: 'function',
              function: { name: call.name, arguments: JSON.stringify(call.args) },
            })),
          },
        },
      ],
    }),
  );
}

/** Contenu des messages `tool` d'une requête (résultats des outils déjà exécutés). */
export function toolResults(raw: string): string[] {
  try {
    const messages =
      (JSON.parse(raw) as { messages?: { role: string; content: unknown }[] }).messages ?? [];
    return messages.filter((m) => m.role === 'tool').map((m) => String(m.content));
  } catch {
    return [];
  }
}
