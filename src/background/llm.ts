// Client LLM compatible OpenAI (BYOK) : structured output json_schema, timeout, un retry.
// Outils (function calling) : la réponse finale reste le `content` au schéma strict ; un tour peut
// à la place demander des outils (`tool_calls`). Un fournisseur qui refuse les outils est mémorisé.
import { recipeJsonSchema } from '../shared/schema';
import type { Settings } from '../shared/types';

const TIMEOUT_MS = 15_000;

export class LlmError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** Paramètre de requête refusé par le modèle (ex. « temperature »), s'il est connu. */
    readonly rejectedParam: string | null = null,
    /** Message brut du fournisseur : usage interne (valeurs acceptées), jamais affiché. */
    readonly providerMessage = '',
  ) {
    super(message);
  }
}

/** Le fournisseur refuse les outils (function calling) : l'appelant repasse en un seul coup. */
export class ToolsUnsupportedError extends LlmError {}

/** Modèles qui ont refusé les outils (mémorisé pour ne plus les proposer). */
const noTools = new Set<string>();

export function toolsSupported(model: string): boolean {
  return !noTools.has(model);
}

/**
 * Un 400 qui vise les outils, et pas le schéma de réponse. Certains modèles à raisonnement les
 * refusent en nommant un autre paramètre (« Function tools with reasoning_effort are not
 * supported … in /v1/chat/completions ») : le message fait foi.
 */
export function isToolsRefusal(error: LlmError): boolean {
  const message = error.providerMessage;
  if (
    /function tools?\b[^.]{0,80}not supported|tools? (?:are|is) not supported|does(?: not|n't) support (?:function )?tools/i.test(
      message,
    )
  )
    return true;
  if (error.rejectedParam)
    return /^(?:tools|tool_choice|parallel_tool_calls|functions)\b/.test(error.rejectedParam);
  return (
    !!message &&
    /\btools?\b|tool_choice|function.?call/i.test(message) &&
    !/response_format|json_schema/i.test(message)
  );
}

/** Paramètres optionnels qu'on retire automatiquement si un modèle les refuse. */
const OPTIONAL_PARAMS = new Set(['temperature']);
/** Mémoire (par modèle) des paramètres refusés, pour ne pas reperdre une requête à chaque fois. */
const rejected = new Map<string, Set<string>>();

/**
 * Effort de raisonnement des GPT-6, du plus rapide au plus lent. Tous les modèles n'acceptent pas
 * « none » (ex. gpt-6.2-astra) : on se replie vers la valeur acceptée la plus faible, puis on
 * omet le paramètre. Le choix est mémorisé par modèle (null = paramètre omis).
 */
const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'] as const;
const effortByModel = new Map<string, string | null>();

export function nextEffort(current: string | null, providerMessage: string): string | null {
  if (current === null) return null;
  const supported = providerMessage
    .match(/supported values are:?\s*([^\n]+)/i)?.[1]
    ?.match(/'([a-z]+)'|"([a-z]+)"|\b([a-z]+)\b/gi)
    ?.map((v) => v.replace(/['"]/g, '').toLowerCase())
    .filter(
      (v): v is (typeof EFFORTS)[number] =>
        (EFFORTS as readonly string[]).includes(v) && v !== current,
    );
  if (supported?.length) {
    return [...supported].sort((a, b) => EFFORTS.indexOf(a) - EFFORTS.indexOf(b))[0]!;
  }
  // Sans liste : « none » → « low » → paramètre omis.
  return current === 'none' || current === 'minimal' ? 'low' : null;
}

/** Extrait { message, param } d'un corps d'erreur au format OpenAI. */
function providerError(body: string): { message: string; param: string | null } {
  try {
    const error = (JSON.parse(body) as { error?: { message?: string; param?: string | null } })
      .error;
    return { message: String(error?.message ?? '').slice(0, 600), param: error?.param ?? null };
  } catch {
    return { message: '', param: null };
  }
}

function describeHttpError(status: number, body: string): LlmError {
  if (status === 401 || status === 403) {
    return new LlmError(
      'API key rejected. Check the key and access to the model in Options.',
      false,
    );
  }
  if (status === 404) return new LlmError('Model or API URL not found. Check Options.', false);
  if (status === 429) {
    return /quota|credit|billing/i.test(body)
      ? new LlmError('API quota or credits exhausted at the provider.', false)
      : new LlmError('Rate limit reached. Try again in a moment.', true);
  }
  if (status === 400) {
    const { message } = providerError(body);
    // Certains fournisseurs nomment le paramètre seulement dans le message.
    const param =
      providerError(body).param ?? (/reasoning_effort/i.test(message) ? 'reasoning_effort' : null);
    const parameter = typeof param === 'string' && /^[\w.[\]-]{1,100}$/.test(param) ? param : '';
    return new LlmError(
      parameter === 'response_format'
        ? 'Request rejected: Invalid schema for response_format. Check the model.'
        : parameter
          ? `Request rejected: the "${parameter}" parameter isn’t compatible with this model.`
          : 'Request rejected (HTTP 400). Check the model and the API parameters.',
      false,
      param,
      message,
    );
  }
  return new LlmError(`The LLM provider responded ${status}.`, status >= 500);
}

/** Partie d'un message multimodal (texte, ou image en data URL pour l'affinage visuel). */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

/** Appel d'outil demandé par le modèle (format OpenAI). */
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type AssistantMessage = {
  role: 'assistant';
  content: string | null;
  tool_calls?: ToolCall[];
};

export type ChatMessage =
  | { role: 'system' | 'user'; content: string | ContentPart[] }
  | AssistantMessage
  | { role: 'tool'; tool_call_id: string; content: string };

/** Outil proposé au modèle : `parameters` est un schéma JSON compatible avec le mode strict. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: object;
}

/** Un tour : soit la réponse finale (JSON au schéma), soit des appels d'outils. */
export type Turn =
  | { kind: 'answer'; value: unknown }
  | { kind: 'tools'; message: AssistantMessage; calls: ToolCall[] };

export type ResponseSchema = { name: string; schema: object };

interface TurnOptions {
  schema?: ResponseSchema;
  tools?: ToolSpec[];
  /** `none` : le modèle doit répondre (dernier tour, budget épuisé). */
  toolChoice?: 'auto' | 'none';
}

/** Moitié isolée d'une paire de substitution UTF-16 (un emoji coupé en deux). */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/**
 * Les textes de la page sont coupés au caractère UTF-16 près (échantillons de 30 à 60 caractères) :
 * un emoji coupé en deux (« 📚 » dans un titre YouTube) rend tout le corps JSON invalide pour le
 * fournisseur, qui refuse la requête (HTTP 400 « failed to parse JSON »). On remplace ces moitiés
 * isolées par « � » avant l'envoi.
 */
export function wellFormedMessages(messages: ChatMessage[]): ChatMessage[] {
  const clean = (text: string) => text.replace(LONE_SURROGATE, '\ufffd');
  return messages.map((message): ChatMessage => {
    if (message.role === 'tool') return { ...message, content: clean(message.content) };
    if (message.role === 'assistant')
      return { ...message, content: message.content === null ? null : clean(message.content) };
    return {
      ...message,
      content:
        typeof message.content === 'string'
          ? clean(message.content)
          : message.content.map((part) =>
              part.type === 'text' ? { ...part, text: clean(part.text) } : part,
            ),
    };
  });
}

/** GPT-6 : refuse temperature, accepte (selon le modèle) reasoning_effort. */
function isGpt6(model: string): boolean {
  return /^(?:openai\/)?gpt-6(?:[.-]|$)/i.test(model);
}

function effortParam(model: string): { reasoning_effort?: string } {
  const effort = effortByModel.has(model) ? effortByModel.get(model)! : 'none';
  return effort === null ? {} : { reasoning_effort: effort };
}

const RECIPE_SCHEMA: ResponseSchema = { name: 'recipe', schema: recipeJsonSchema };

async function once(
  settings: Settings,
  messages: ChatMessage[],
  { schema: responseSchema = RECIPE_SCHEMA, tools, toolChoice = 'auto' }: TurnOptions,
): Promise<Turn> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: wellFormedMessages(messages),
        // GPT-6 refuse temperature. Sans raisonnement, la réponse arrive 2× plus vite (≈2,7 s au
        // lieu de 5 s) : le contexte design fournit déjà les sélecteurs et la structure.
        ...(isGpt6(settings.model)
          ? effortParam(settings.model)
          : rejected.get(settings.model)?.has('temperature')
            ? {}
            : { temperature: 0.2 }),
        response_format: {
          type: 'json_schema',
          json_schema: { ...responseSchema, strict: true },
        },
        ...(tools?.length
          ? {
              tools: tools.map((tool) => ({
                type: 'function',
                function: { ...tool, strict: true },
              })),
              tool_choice: toolChoice,
            }
          : {}),
      }),
    });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    throw new LlmError(
      aborted ? 'The LLM took too long to respond.' : 'Can’t reach the LLM API (network?).',
      true,
    );
  } finally {
    clearTimeout(timer);
  }

  const body = await response.text();
  if (!response.ok) {
    const error = describeHttpError(response.status, body);
    if (tools?.length && response.status === 400 && isToolsRefusal(error)) {
      noTools.add(settings.model);
      throw new ToolsUnsupportedError(error.message, false, error.rejectedParam);
    }
    throw error;
  }
  try {
    const data = JSON.parse(body) as {
      choices?: {
        message?: { content?: string | null; refusal?: string; tool_calls?: ToolCall[] };
      }[];
    };
    const message = data.choices?.[0]?.message;
    if (message?.refusal) throw new LlmError(`The model refused: ${message.refusal}`, false);
    const calls = (message?.tool_calls ?? []).filter(
      (call) => call?.type === 'function' && typeof call.function?.name === 'string',
    );
    if (tools?.length && calls.length) {
      const toolCalls = calls.map((call) => ({
        id: String(call.id),
        type: 'function' as const,
        function: { name: call.function.name, arguments: String(call.function.arguments ?? '') },
      }));
      return {
        kind: 'tools',
        message: { role: 'assistant', content: message?.content ?? null, tool_calls: toolCalls },
        calls: toolCalls,
      };
    }
    return { kind: 'answer', value: JSON.parse(message?.content ?? '') };
  } catch (error) {
    if (error instanceof LlmError) throw error;
    throw new LlmError('Unreadable LLM response (invalid JSON).', true);
  }
}

/** Appelle le LLM, avec un seul retry sur les erreurs transitoires. */
export async function completeJson(
  settings: Settings,
  messages: ChatMessage[],
  responseSchema: ResponseSchema = RECIPE_SCHEMA,
): Promise<unknown> {
  const turn = await completeTurn(settings, messages, { schema: responseSchema });
  if (turn.kind !== 'answer') throw new LlmError('Unreadable LLM response (invalid JSON).', true);
  return turn.value;
}

/**
 * Un tour de conversation, éventuellement avec des outils. Mêmes replis que `completeJson`
 * (paramètres refusés, effort de raisonnement, un retry transitoire) ; un refus des outils lève
 * `ToolsUnsupportedError`, mémorisé pour ce modèle.
 */
/**
 * Ce qu'on a appris des modèles (paramètres refusés, effort accepté, outils natifs refusés) est
 * gardé dans chrome.storage.session : le service worker s'endort après ~30 s et oubliait tout,
 * d'où 1 à 2 requêtes perdues (≈ 2 s) au début de chaque génération. Effacé au redémarrage du
 * navigateur (un fournisseur peut changer d'avis).
 */
const QUIRKS_KEY = 'llm-quirks:v1';
type Quirks = Record<string, { rejected?: string[]; effort?: string | null; noTools?: boolean }>;
let quirksLoaded: Promise<void> | null = null;

function sessionStore(): chrome.storage.StorageArea | null {
  try {
    return typeof chrome !== 'undefined' ? (chrome.storage?.session ?? null) : null;
  } catch {
    return null;
  }
}

async function readQuirks(store: chrome.storage.StorageArea): Promise<Quirks> {
  const data = (await store.get(QUIRKS_KEY).catch(() => ({}))) as Record<string, unknown>;
  return (data[QUIRKS_KEY] ?? {}) as Quirks;
}

function loadQuirks(): Promise<void> {
  quirksLoaded ??= (async () => {
    const store = sessionStore();
    if (!store) return;
    const quirks = await readQuirks(store);
    for (const [model, q] of Object.entries(quirks)) {
      if (q.rejected?.length && !rejected.has(model)) rejected.set(model, new Set(q.rejected));
      if (q.effort !== undefined && !effortByModel.has(model)) effortByModel.set(model, q.effort);
      if (q.noTools) noTools.add(model);
    }
  })();
  return quirksLoaded;
}

async function saveQuirks(model: string): Promise<void> {
  const store = sessionStore();
  if (!store) return;
  const all = await readQuirks(store);
  all[model] = {
    rejected: [...(rejected.get(model) ?? [])],
    ...(effortByModel.has(model) ? { effort: effortByModel.get(model)! } : {}),
    noTools: noTools.has(model),
  };
  await store.set({ [QUIRKS_KEY]: all }).catch(() => undefined);
}

export async function completeTurn(
  settings: Settings,
  messages: ChatMessage[],
  options: TurnOptions = {},
): Promise<Turn> {
  if (!settings.apiKey.trim()) {
    throw new LlmError('No API key configured. Open Options to add one.', false);
  }
  await loadQuirks();
  try {
    return await completeTurnOnce(settings, messages, options);
  } catch (error) {
    if (error instanceof ToolsUnsupportedError) await saveQuirks(settings.model);
    throw error;
  }
}

async function completeTurnOnce(
  settings: Settings,
  messages: ChatMessage[],
  options: TurnOptions,
): Promise<Turn> {
  let transientRetryUsed = false;
  // Au plus : un retry transitoire, un par paramètre optionnel refusé, 3 replis d'effort.
  for (let attempt = 0; attempt < 5 + OPTIONAL_PARAMS.size; attempt++) {
    try {
      return await once(settings, messages, options);
    } catch (error) {
      if (!(error instanceof LlmError) || error instanceof ToolsUnsupportedError) throw error;
      const param = error.rejectedParam;
      if (param === 'reasoning_effort' && isGpt6(settings.model)) {
        const current = effortByModel.has(settings.model)
          ? effortByModel.get(settings.model)!
          : 'none';
        if (current !== null) {
          effortByModel.set(settings.model, nextEffort(current, error.providerMessage));
          void saveQuirks(settings.model);
          continue;
        }
      }
      const known = rejected.get(settings.model) ?? new Set<string>();
      if (param && OPTIONAL_PARAMS.has(param) && !known.has(param)) {
        rejected.set(settings.model, known.add(param));
        void saveQuirks(settings.model);
        continue;
      }
      if (error.retryable && !transientRetryUsed) {
        transientRetryUsed = true;
        continue;
      }
      throw error;
    }
  }
  throw new LlmError('The LLM couldn’t respond.', false);
}

/** Test de connexion : GET /models (supporté par OpenAI, Groq, Gemini en mode compatible). */
export async function listModels(settings: Settings): Promise<string[]> {
  if (!settings.apiKey.trim()) throw new LlmError('Enter an API key.', false);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${settings.baseUrl.replace(/\/+$/, '')}/models`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${settings.apiKey}` },
    });
    const body = await response.text();
    if (!response.ok) throw describeHttpError(response.status, body);
    const data = JSON.parse(body) as { data?: { id?: string }[] };
    return (data.data ?? [])
      .map((m) => String(m.id ?? '').replace(/^models\//, ''))
      .filter(Boolean)
      .sort();
  } catch (error) {
    if (error instanceof LlmError) throw error;
    throw new LlmError('Can’t reach the API. Check the base URL.', false);
  } finally {
    clearTimeout(timer);
  }
}
