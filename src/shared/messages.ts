// Contrat de messagerie typé : panel ↔ service worker ↔ content script.
// Pour ajouter un message : une entrée dans BgApi ou ContentApi, puis un handler.

interface Def<Req, Res> {
  req: Req;
  res: Res;
}

/** Messages traités par le service worker. */
export interface BgApi {
  ping: Def<{ tabId: number }, { host: string; content: 'ok' | 'unreachable' }>;
}

/** Messages traités par le content script B (document_idle). */
export interface ContentApi {
  ping: Def<Record<string, never>, { host: string }>;
}

type Envelope<A> = {
  [K in keyof A]: { type: K; payload: A[K] extends Def<infer R, unknown> ? R : never };
}[keyof A];
export type BgMessage = Envelope<BgApi>;
export type ContentMessage = Envelope<ContentApi>;

/** Réponse uniforme : les erreurs traversent la frontière sous forme de texte. */
export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

async function unwrap<T>(promise: Promise<Reply<T> | undefined>): Promise<T> {
  const reply = await promise;
  if (!reply) throw new Error('Aucune réponse du destinataire.');
  if (!reply.ok) throw new Error(reply.error);
  return reply.data;
}

export function callBg<K extends keyof BgApi>(
  type: K,
  payload: BgApi[K]['req'],
): Promise<BgApi[K]['res']> {
  return unwrap(chrome.runtime.sendMessage({ type, payload }));
}

export function callContent<K extends keyof ContentApi>(
  tabId: number,
  type: K,
  payload: ContentApi[K]['req'],
): Promise<ContentApi[K]['res']> {
  return unwrap(chrome.tabs.sendMessage(tabId, { type, payload }));
}

type Handlers<A> = {
  [K in keyof A]: (
    payload: A[K] extends Def<infer R, unknown> ? R : never,
    sender: chrome.runtime.MessageSender,
  ) => Promise<A[K] extends Def<unknown, infer S> ? S : never>;
};

/** Branche des handlers typés sur chrome.runtime.onMessage. */
export function listen<A>(handlers: Handlers<A>): void {
  chrome.runtime.onMessage.addListener(
    (message: { type?: unknown; payload?: unknown }, sender, sendResponse) => {
      const handler = handlers[message?.type as keyof A] as
        ((payload: unknown, sender: chrome.runtime.MessageSender) => Promise<unknown>) | undefined;
      if (!handler) return false;
      handler(message.payload, sender).then(
        (data) => sendResponse({ ok: true, data } satisfies Reply<unknown>),
        (error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          } satisfies Reply<unknown>),
      );
      return true; // réponse asynchrone
    },
  );
}
