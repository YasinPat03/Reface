// Contrat de messagerie typé : panel ↔ service worker ↔ content script.
// Pour ajouter un message : une entrée dans BgApi ou ContentApi, puis un handler.
import type { DistillResult, Draft, PickResult, Recipe, Settings } from './types';

interface Def<Req, Res> {
  req: Req;
  res: Res;
}

/** Messages traités par le service worker. */
export interface BgApi {
  ping: Def<{ tabId: number }, { host: string; content: 'ok' | 'unreachable' }>;
  /** Prompt → LLM → recette → preview. `previous` = brouillon en cours (itération). */
  generate: Def<
    { tabId: number; prompt: string; previous: Draft | null; pick: string | null },
    Draft
  >;
  /** Enregistre le brouillon comme règle du site. */
  keep: Def<{ tabId: number; draft: Draft }, { ruleId: string }>;
  /** Retire la preview. */
  discard: Def<{ tabId: number }, null>;
  /** Vérifie la clé et liste les modèles disponibles. */
  testConnection: Def<Settings, { models: string[]; modelFound: boolean }>;
  /** Cache l'élément pointé, sans LLM. */
  quickHide: Def<{ tabId: number; pick: PickResult }, { ruleId: string }>;
}

/** Messages traités par le content script B (document_idle). */
export interface ContentApi {
  ping: Def<Record<string, never>, { host: string }>;
  /** `focus` : élément pointé, inclus avec ses ancêtres ET son sous-arbre. */
  distill: Def<{ include: string[]; focus: string | null }, DistillResult>;
  preparePreview: Def<{ recipe: Recipe; prompts: string[] }, Draft>;
  clearPreview: Def<Record<string, never>, null>;
  /** Bascule temporaire Original / Modifié (sans toucher au stockage). `set` absent = lecture. */
  original: Def<{ set?: boolean }, { original: boolean }>;
  /** Lance le picker ; répond à la sélection (null si annulé). */
  pick: Def<Record<string, never>, PickResult | null>;
  cancelPick: Def<Record<string, never>, null>;
  /** Lance le health check tout de suite (bouton « Vérifier », tests). */
  healthCheck: Def<Record<string, never>, { checked: number; suspect: number }>;
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

/** Erreurs Chrome bas niveau → messages compréhensibles. */
function friendlyChromeError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/Receiving end does not exist|Could not establish connection/i.test(message)) {
    return new Error('ReFace n’est pas encore chargé dans cette page : rechargez l’onglet.');
  }
  if (/message port closed|message channel closed/i.test(message)) {
    return new Error('La page a été rechargée ou fermée pendant l’opération. Réessayez.');
  }
  if (/Cannot access|cannot be scripted|extensions gallery/i.test(message)) {
    return new Error('Chrome interdit aux extensions de modifier cette page.');
  }
  return error instanceof Error ? error : new Error(message);
}

export function callContent<K extends keyof ContentApi>(
  tabId: number,
  type: K,
  payload: ContentApi[K]['req'],
): Promise<ContentApi[K]['res']> {
  return unwrap(
    chrome.tabs.sendMessage(tabId, { type, payload }).catch((error: unknown) => {
      throw friendlyChromeError(error);
    }),
  );
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
