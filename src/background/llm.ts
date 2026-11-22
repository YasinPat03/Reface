// Client LLM compatible OpenAI (BYOK) : structured output json_schema, timeout, un retry.
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

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

type ResponseSchema = { name: string; schema: object };

/** GPT-6 : refuse temperature, accepte (selon le modèle) reasoning_effort. */
function isGpt6(model: string): boolean {
  return /^(?:openai\/)?gpt-6(?:[.-]|$)/i.test(model);
}

function effortParam(model: string): { reasoning_effort?: string } {
  const effort = effortByModel.has(model) ? effortByModel.get(model)! : 'none';
  return effort === null ? {} : { reasoning_effort: effort };
}

async function once(
  settings: Settings,
  messages: ChatMessage[],
  responseSchema: ResponseSchema,
): Promise<unknown> {
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
        messages,
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
  if (!response.ok) throw describeHttpError(response.status, body);
  let content: unknown;
  try {
    const data = JSON.parse(body) as {
      choices?: { message?: { content?: string; refusal?: string } }[];
    };
    const message = data.choices?.[0]?.message;
    if (message?.refusal) throw new LlmError(`The model refused: ${message.refusal}`, false);
    content = JSON.parse(message?.content ?? '');
  } catch (error) {
    if (error instanceof LlmError) throw error;
    throw new LlmError('Unreadable LLM response (invalid JSON).', true);
  }
  return content;
}

/** Appelle le LLM, avec un seul retry sur les erreurs transitoires. */
export async function completeJson(
  settings: Settings,
  messages: ChatMessage[],
  responseSchema: ResponseSchema = { name: 'recipe', schema: recipeJsonSchema },
): Promise<unknown> {
  if (!settings.apiKey.trim()) {
    throw new LlmError('No API key configured. Open Options to add one.', false);
  }
  let transientRetryUsed = false;
  // Au plus : un retry transitoire, un par paramètre optionnel refusé, 3 replis d'effort.
  for (let attempt = 0; attempt < 5 + OPTIONAL_PARAMS.size; attempt++) {
    try {
      return await once(settings, messages, responseSchema);
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      const param = error.rejectedParam;
      if (param === 'reasoning_effort' && isGpt6(settings.model)) {
        const current = effortByModel.has(settings.model)
          ? effortByModel.get(settings.model)!
          : 'none';
        if (current !== null) {
          effortByModel.set(settings.model, nextEffort(current, error.providerMessage));
          continue;
        }
      }
      const known = rejected.get(settings.model) ?? new Set<string>();
      if (param && OPTIONAL_PARAMS.has(param) && !known.has(param)) {
        rejected.set(settings.model, known.add(param));
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
