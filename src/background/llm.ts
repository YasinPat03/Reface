// Client LLM compatible OpenAI (BYOK) : structured output json_schema, timeout, un retry.
import { recipeJsonSchema } from '../shared/schema';
import type { Settings } from '../shared/types';

const TIMEOUT_MS = 15_000;

export class LlmError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
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
    return new LlmError(
      'Le fournisseur a refusé la requête (le modèle supporte-t-il les structured outputs ?).',
      false,
    );
  }
  return new LlmError(`Le fournisseur LLM a répondu ${status}.`, status >= 500);
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

async function once(settings: Settings, messages: ChatMessage[]): Promise<unknown> {
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
        temperature: 0.2,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'recipe', strict: true, schema: recipeJsonSchema },
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
export async function completeJson(settings: Settings, messages: ChatMessage[]): Promise<unknown> {
  if (!settings.apiKey.trim()) {
    throw new LlmError('Aucune clé API configurée. Ouvrez les Options pour en ajouter une.', false);
  }
  try {
    return await once(settings, messages);
  } catch (error) {
    if (error instanceof LlmError && error.retryable) return once(settings, messages);
    throw error;
  }
}
