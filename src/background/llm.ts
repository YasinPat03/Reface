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
  ) {
    super(message);
  }
}

/** Paramètres optionnels qu'on retire automatiquement si un modèle les refuse. */
const OPTIONAL_PARAMS = new Set(['temperature']);
/** Mémoire (par modèle) des paramètres refusés, pour ne pas reperdre une requête à chaque fois. */
const rejected = new Map<string, Set<string>>();

/** Extrait { message, param } d'un corps d'erreur au format OpenAI. */
function providerError(body: string): { message: string; param: string | null } {
  try {
    const error = (JSON.parse(body) as { error?: { message?: string; param?: string | null } })
      .error;
    return { message: String(error?.message ?? '').slice(0, 200), param: error?.param ?? null };
  } catch {
    return { message: '', param: null };
  }
}

function describeHttpError(status: number, body: string): LlmError {
  if (status === 401 || status === 403) {
    return new LlmError(
      'Clé API refusée. Vérifiez la clé et l’accès au modèle dans les Options.',
      false,
    );
  }
  if (status === 404)
    return new LlmError('Modèle ou URL d’API introuvable. Vérifiez les Options.', false);
  if (status === 429) {
    return /quota|credit|billing/i.test(body)
      ? new LlmError('Quota ou crédits API épuisés chez le fournisseur.', false)
      : new LlmError('Limite de requêtes atteinte. Réessayez dans un instant.', true);
  }
  if (status === 400) {
    const { param } = providerError(body);
    const parameter = typeof param === 'string' && /^[\w.[\]-]{1,100}$/.test(param) ? param : '';
    return new LlmError(
      parameter === 'response_format'
        ? 'Requête refusée : Invalid schema for response_format. Vérifiez le modèle.'
        : parameter
          ? `Requête refusée : le paramètre « ${parameter} » est incompatible avec ce modèle.`
          : 'Requête refusée (HTTP 400). Vérifiez le modèle et les paramètres de l’API.',
      false,
      param,
    );
  }
  return new LlmError(`Le fournisseur LLM a répondu ${status}.`, status >= 500);
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

type ResponseSchema = { name: string; schema: object };

async function once(
  settings: Settings,
  messages: ChatMessage[],
  responseSchema: ResponseSchema,
): Promise<unknown> {
  const isGpt6 = /^(?:openai\/)?gpt-6(?:[.-]|$)/i.test(settings.model);
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
        // GPT-6 refuse temperature ; un effort faible convient aux recettes CSS interactives.
        ...(isGpt6
          ? { reasoning_effort: 'low' }
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
      aborted
        ? 'Le LLM a mis trop de temps à répondre.'
        : 'Impossible de joindre l’API du LLM (réseau ?).',
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
    if (message?.refusal) throw new LlmError(`Le modèle a refusé : ${message.refusal}`, false);
    content = JSON.parse(message?.content ?? '');
  } catch (error) {
    if (error instanceof LlmError) throw error;
    throw new LlmError('Réponse illisible du LLM (JSON invalide).', true);
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
    throw new LlmError('Aucune clé API configurée. Ouvrez les Options pour en ajouter une.', false);
  }
  let transientRetryUsed = false;
  // Au plus : un retry transitoire + un retry par paramètre optionnel refusé.
  for (let attempt = 0; attempt < 2 + OPTIONAL_PARAMS.size; attempt++) {
    try {
      return await once(settings, messages, responseSchema);
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      const param = error.rejectedParam;
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
  throw new LlmError('Le LLM n’a pas pu répondre.', false);
}

/** Test de connexion : GET /models (supporté par OpenAI, Groq, Gemini en mode compatible). */
export async function listModels(settings: Settings): Promise<string[]> {
  if (!settings.apiKey.trim()) throw new LlmError('Renseignez une clé API.', false);
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
    throw new LlmError('Impossible de joindre l’API. Vérifiez l’URL de base.', false);
  } finally {
    clearTimeout(timer);
  }
}
