import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ToolsUnsupportedError,
  completeJson,
  completeTurn,
  listModels,
  nextEffort,
  toolsSupported,
  wellFormedMessages,
  type ToolSpec,
} from '../src/background/llm';

const settings = { apiKey: 'sk-test', baseUrl: 'https://api.test/v1/', model: 'm' };
const messages = [{ role: 'user' as const, content: 'x' }];

function reply(status: number, body: unknown) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}
const ok = (content: unknown) =>
  reply(200, { choices: [{ message: { content: JSON.stringify(content) } }] });

afterEach(() => vi.unstubAllGlobals());

describe('wellFormedMessages', () => {
  it('remplace un emoji coupé en deux (sinon le fournisseur refuse tout le JSON)', () => {
    const cut = 'lofi hip hop radio ' + '📚'.slice(0, 1);
    const [text, multi] = wellFormedMessages([
      { role: 'user', content: `${cut} beats` },
      {
        role: 'user',
        content: [
          { type: 'text', text: '📚'.slice(1) + ' ok 📚' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
        ],
      },
    ]);
    expect(text!.content).toBe('lofi hip hop radio \ufffd beats');
    expect(multi!.content).toEqual([
      { type: 'text', text: '\ufffd ok 📚' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ]);
    // Le corps envoyé est du JSON bien formé (aucune moitié d'emoji ne survit).
    expect(JSON.stringify(wellFormedMessages([{ role: 'user', content: cut }]))).not.toMatch(
      /\\ud83d/,
    );
  });
});

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
    [401, '{}', /API key rejected/],
    [403, '{}', /API key rejected/],
    [404, '{}', /not found/],
    [429, '{"error":{"code":"insufficient_quota"}}', /quota/],
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
      expect(body.reasoning_effort).toBe('none');
      expect(body.response_format.json_schema.strict).toBe(true);
    },
  );

  const effortRefused = (message = 'Unsupported value for reasoning_effort.') =>
    reply(400, { error: { param: 'reasoning_effort', message } });
  const sentEffort = (fetch: ReturnType<typeof vi.fn>, call: number) =>
    JSON.parse(fetch.mock.calls[call]![1].body).reasoning_effort;

  it('Astra refuse « none » : repli sur « low », mémorisé pour les appels suivants', async () => {
    const model = 'gpt-6.2-astra';
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(effortRefused())
      .mockImplementation(() => Promise.resolve(ok({ a: 1 })));
    vi.stubGlobal('fetch', fetch);
    await expect(completeJson({ ...settings, model }, messages)).resolves.toEqual({ a: 1 });
    expect([sentEffort(fetch, 0), sentEffort(fetch, 1)]).toEqual(['none', 'low']);
    await completeJson({ ...settings, model }, messages);
    expect(sentEffort(fetch, 2)).toBe('low'); // pas de nouvelle requête perdue
  });

  it('valeurs acceptées listées par le fournisseur : la plus faible est choisie', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        effortRefused(
          "Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'medium', 'low' and 'high'.",
        ),
      )
      .mockImplementation(() => Promise.resolve(ok({ a: 1 })));
    vi.stubGlobal('fetch', fetch);
    await completeJson({ ...settings, model: 'gpt-6-test-list' }, messages);
    expect(sentEffort(fetch, 1)).toBe('low');
  });

  it('paramètre refusé quelle que soit la valeur : il est omis', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(effortRefused())
      .mockResolvedValueOnce(effortRefused())
      .mockImplementation(() => Promise.resolve(ok({ a: 1 })));
    vi.stubGlobal('fetch', fetch);
    await expect(
      completeJson({ ...settings, model: 'gpt-6-test-none' }, messages),
    ).resolves.toEqual({ a: 1 });
    expect(JSON.parse(fetch.mock.calls[2]![1].body)).not.toHaveProperty('reasoning_effort');
  });

  it('nextEffort : none → low → omis', () => {
    expect(nextEffort('none', '')).toBe('low');
    expect(nextEffort('low', '')).toBeNull();
    expect(nextEffort(null, '')).toBeNull();
  });

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
    await expect(completeJson(settings, messages)).rejects.toThrow(/invalid JSON/);
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
    expect(((await result) as Error).message).toMatch(/too long/);
    vi.useRealTimers();
  });

  it('refus du modèle : message clair', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(reply(200, { choices: [{ message: { refusal: 'non' } }] })),
    );
    await expect(completeJson(settings, messages)).rejects.toThrow(/refused: non/);
  });

  it('clé vide : pas d’appel réseau', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(completeJson({ ...settings, apiKey: ' ' }, messages)).rejects.toThrow(
      /No API key/,
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

describe('completeTurn : outils (function calling)', () => {
  const tools: ToolSpec[] = [
    {
      name: 'find_elements',
      description: 'Search the page.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['queries'],
        properties: { queries: { type: 'array', items: { type: 'string' } } },
      },
    },
  ];
  const toolReply = (calls: { id: string; name: string; arguments: string }[]) =>
    reply(200, {
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: calls.map((c) => ({
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: c.arguments },
            })),
          },
        },
      ],
    });

  it('envoie les outils en mode strict avec tool_choice, sans retirer response_format', async () => {
    const fetch = vi.fn().mockResolvedValue(ok({ changes: [], explanation: '' }));
    vi.stubGlobal('fetch', fetch);
    const turn = await completeTurn({ ...settings, model: 't1' }, messages, {
      tools,
      toolChoice: 'none',
    });
    expect(turn).toEqual({ kind: 'answer', value: { changes: [], explanation: '' } });
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.tools[0]).toEqual({ type: 'function', function: { ...tools[0], strict: true } });
    expect(body.tool_choice).toBe('none');
    expect(body.response_format.json_schema.strict).toBe(true);
  });

  it('lit les appels d’outils et renvoie le message de l’assistant à recopier', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          toolReply([{ id: 'c1', name: 'find_elements', arguments: '{"queries":["Beta"]}' }]),
        ),
    );
    const turn = await completeTurn({ ...settings, model: 't2' }, messages, { tools });
    expect(turn.kind).toBe('tools');
    if (turn.kind !== 'tools') return;
    expect(turn.calls).toEqual([
      {
        id: 'c1',
        type: 'function',
        function: { name: 'find_elements', arguments: '{"queries":["Beta"]}' },
      },
    ]);
    expect(turn.message).toEqual({ role: 'assistant', content: null, tool_calls: turn.calls });
  });

  it('sans outils, pas de champ tools dans la requête', async () => {
    const fetch = vi.fn().mockResolvedValue(ok({ a: 1 }));
    vi.stubGlobal('fetch', fetch);
    await completeJson(settings, messages);
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it('un 400 sur « tools » marque le modèle et lève ToolsUnsupportedError, sans retry', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        reply(400, {
          error: { message: 'tools is not supported with this model', param: 'tools' },
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const model = { ...settings, model: 'no-tools-model' };
    await expect(completeTurn(model, messages, { tools })).rejects.toBeInstanceOf(
      ToolsUnsupportedError,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(toolsSupported('no-tools-model')).toBe(false);
    expect(toolsSupported('t1')).toBe(true);
  });

  it('un refus sans « param » mais qui parle d’outils est aussi reconnu', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          reply(400, { error: { message: 'Function calling is not enabled for this model' } }),
        ),
    );
    await expect(
      completeTurn({ ...settings, model: 'gemini-x' }, messages, { tools }),
    ).rejects.toBeInstanceOf(ToolsUnsupportedError);
  });

  it('un 400 sur response_format n’est PAS un refus des outils', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        reply(400, {
          error: { message: 'Invalid schema for response_format', param: 'response_format' },
        }),
      ),
    );
    const error = await completeTurn({ ...settings, model: 'schema-bug' }, messages, {
      tools,
    }).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ToolsUnsupportedError);
    expect(toolsSupported('schema-bug')).toBe(true);
  });

  it('wellFormedMessages accepte un assistant sans texte et nettoie les messages tool', () => {
    const cut = '📚'.slice(0, 1);
    const [assistant, tool] = wellFormedMessages([
      { role: 'assistant', content: null, tool_calls: [] },
      { role: 'tool', tool_call_id: 'c1', content: `titre ${cut}` },
    ]);
    expect(assistant).toEqual({ role: 'assistant', content: null, tool_calls: [] });
    expect(tool).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'titre \ufffd' });
  });
});
