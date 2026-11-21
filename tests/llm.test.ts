import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeJson, listModels } from '../src/background/llm';

const settings = { apiKey: 'sk-test', baseUrl: 'https://api.test/v1/', model: 'm' };
const messages = [{ role: 'user' as const, content: 'x' }];

function reply(status: number, body: unknown) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}
const ok = (content: unknown) =>
  reply(200, { choices: [{ message: { content: JSON.stringify(content) } }] });

afterEach(() => vi.unstubAllGlobals());

describe('completeJson : gestion des erreurs (5.3)', () => {
  it('renvoie le JSON du message et appelle /chat/completions en json_schema strict', async () => {
    const fetch = vi.fn().mockResolvedValue(ok({ a: 1 }));
    vi.stubGlobal('fetch', fetch);
    await expect(completeJson(settings, messages)).resolves.toEqual({ a: 1 });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.test/v1/chat/completions');
    expect(JSON.parse(init.body).response_format.json_schema.strict).toBe(true);
    expect(JSON.parse(init.body).temperature).toBe(0.2);
    expect(init.headers.Authorization).toBe('Bearer sk-test');
  });

  it.each([
    [401, '{}', /Clé API refusée/],
    [403, '{}', /Clé API refusée/],
    [404, '{}', /introuvable/],
    [429, '{"error":{"code":"insufficient_quota"}}', /Quota/],
    [400, '{}', /HTTP 400/],
    [
      400,
      '{"error":{"message":"Invalid schema for response_format","param":"response_format"}}',
      /Invalid schema/,
    ],
  ])('HTTP %i → message clair, sans retry', async (status, body, pattern) => {
    const fetch = vi.fn().mockResolvedValue(reply(status, body));
    vi.stubGlobal('fetch', fetch);
    await expect(completeJson(settings, messages)).rejects.toThrow(pattern);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6-luna', 'openai/gpt-6.2-sol'])(
    '%s : omet temperature et utilise un effort faible',
    async (model) => {
      const fetch = vi.fn().mockResolvedValue(ok({ a: 1 }));
      vi.stubGlobal('fetch', fetch);
      await completeJson({ ...settings, model }, messages);
      const body = JSON.parse(fetch.mock.calls[0]![1].body);
      expect(body).not.toHaveProperty('temperature');
      expect(body.reasoning_effort).toBe('low');
      expect(body.response_format.json_schema.strict).toBe(true);
    },
  );

  it('HTTP 400 : indique le paramètre refusé sans exposer le message brut', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        reply(400, { error: { param: 'reasoning_effort', message: 'private provider details' } }),
      );
    vi.stubGlobal('fetch', fetch);
    const error = (await completeJson(settings, messages).catch((e: Error) => e)) as Error;
    expect(error.message).toContain('reasoning_effort');
    expect(error.message).not.toContain('private provider details');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('429 limite de débit : un retry', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply(429, '{}'))
      .mockResolvedValueOnce(ok({ b: 2 }));
    vi.stubGlobal('fetch', fetch);
    await expect(completeJson(settings, messages)).resolves.toEqual({ b: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('JSON invalide deux fois : message clair après un retry', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () =>
        reply(200, { choices: [{ message: { content: 'pas du json' } }] }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(completeJson(settings, messages)).rejects.toThrow(/JSON invalide/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('timeout : message clair', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(
          (_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) =>
              init.signal!.addEventListener('abort', () =>
                reject(new DOMException('aborted', 'AbortError')),
              ),
            ),
        ),
    );
    const result = completeJson(settings, messages).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(((await result) as Error).message).toMatch(/trop de temps/);
    vi.useRealTimers();
  });

  it('refus du modèle : message clair', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(reply(200, { choices: [{ message: { refusal: 'non' } }] })),
    );
    await expect(completeJson(settings, messages)).rejects.toThrow(/refusé : non/);
  });

  it('clé vide : pas d’appel réseau', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(completeJson({ ...settings, apiKey: ' ' }, messages)).rejects.toThrow(
      /Aucune clé/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('paramètres refusés par le modèle', () => {
  it('temperature refusée : on la retire, on réessaie, et on s’en souvient pour ce modèle', async () => {
    const refused = reply(400, {
      error: {
        code: 'unsupported_value',
        param: 'temperature',
        message: 'Only the default (1) value is supported.',
      },
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(refused)
      .mockImplementation(async () => ok({ c: 3 }));
    vi.stubGlobal('fetch', fetch);
    const reasoning = { ...settings, model: 'reasoning-model' };
    await expect(completeJson(reasoning, messages)).resolves.toEqual({ c: 3 });
    expect(JSON.parse(fetch.mock.calls[0]![1].body).temperature).toBe(0.2);
    expect('temperature' in JSON.parse(fetch.mock.calls[1]![1].body)).toBe(false);
    // Appel suivant : directement sans temperature.
    await completeJson(reasoning, messages);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect('temperature' in JSON.parse(fetch.mock.calls[2]![1].body)).toBe(false);
    // Un autre modèle garde sa temperature.
    await completeJson(settings, messages);
    expect(JSON.parse(fetch.mock.calls[3]![1].body).temperature).toBe(0.2);
  });
});

describe('listModels', () => {
  it('liste et trie les modèles (préfixe models/ de Gemini retiré)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(reply(200, { data: [{ id: 'models/b' }, { id: 'a' }] })),
    );
    await expect(listModels(settings)).resolves.toEqual(['a', 'b']);
  });
});
