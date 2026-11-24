import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolCall } from '../src/background/llm';
import {
  MAX_RESULT_CHARS,
  executeToolCalls,
  jsonToolCalls,
  toolSpecs,
} from '../src/background/tools';
import {
  agentStepJsonSchema,
  parseAgentStep,
  recipeJsonSchema,
  refineJsonSchema,
} from '../src/shared/schema';
import { requestQueries } from '../src/shared/requestWords';
import { studyJsonSchema, studyStepJsonSchema } from '../src/shared/study';

/** Mots-clés que les fournisseurs compatibles OpenAI refusent (ou ignorent) en mode strict. */
const UNSUPPORTED = [
  'minItems',
  'maxItems',
  'pattern',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'default',
  'format',
];

/** Vérifie récursivement qu'un schéma JSON respecte le mode strict des structured outputs. */
function strictProblems(schema: unknown, path = '$'): string[] {
  if (!schema || typeof schema !== 'object') return [];
  const node = schema as Record<string, unknown>;
  const problems: string[] = [];
  for (const key of UNSUPPORTED) if (key in node) problems.push(`${path}: "${key}" non supporté`);
  const types = Array.isArray(node.type) ? node.type : [node.type];
  if (types.includes('object')) {
    const properties = (node.properties ?? {}) as Record<string, unknown>;
    if (node.additionalProperties !== false)
      problems.push(`${path}: additionalProperties doit être false`);
    const required = (node.required ?? []) as string[];
    const keys = Object.keys(properties);
    if (keys.length !== required.length || keys.some((k) => !required.includes(k)))
      problems.push(`${path}: toutes les propriétés doivent être dans "required"`);
    for (const [key, value] of Object.entries(properties))
      problems.push(...strictProblems(value, `${path}.${key}`));
  }
  if (node.items) problems.push(...strictProblems(node.items, `${path}[]`));
  for (const variant of (node.anyOf ?? []) as unknown[])
    problems.push(...strictProblems(variant, `${path}|`));
  return problems;
}

describe('schémas compatibles avec le mode strict', () => {
  it('outils, recette et affinage', () => {
    expect(strictProblems(recipeJsonSchema)).toEqual([]);
    expect(strictProblems(refineJsonSchema)).toEqual([]);
    expect(strictProblems(agentStepJsonSchema)).toEqual([]);
    expect(strictProblems(studyJsonSchema)).toEqual([]);
    expect(strictProblems(studyStepJsonSchema)).toEqual([]);
    for (const spec of toolSpecs()) {
      expect(strictProblems(spec.parameters, spec.name)).toEqual([]);
      expect((spec.parameters as { type: string }).type).toBe('object');
      expect(spec.name).toMatch(/^[a-z_]+$/);
    }
  });

  it('le vérificateur détecte bien un schéma fautif', () => {
    expect(
      strictProblems({
        type: 'object',
        properties: { a: { type: 'array', minItems: 1, items: {} } },
      }),
    ).toHaveLength(3);
  });
});

describe('executeToolCalls', () => {
  const sent: { type: string; payload: { calls: { tool: string }[] } }[] = [];
  const stubChrome = (url: string, text = 'résultat') => {
    sent.length = 0;
    vi.stubGlobal('chrome', {
      tabs: {
        get: vi.fn(async () => ({ url })),
        sendMessage: vi.fn(async (_tab: number, message: (typeof sent)[number]) => {
          sent.push(message);
          return {
            ok: true,
            data: {
              stale: false,
              results: message.payload.calls.map((c) => ({
                text: `${c.tool}: ${text}`,
                label: `label ${c.tool}`,
              })),
            },
          };
        }),
      },
    });
  };
  const call = (id: string, name: string, args: unknown): ToolCall => ({
    id,
    type: 'function',
    function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
  });
  afterEach(() => vi.unstubAllGlobals());

  it('un seul message au content script, résultats dans l’ordre et encadrés comme donnée', async () => {
    stubChrome('https://example.com/a');
    const labels: string[] = [];
    const messages = await executeToolCalls(
      1,
      'example.com',
      7,
      [
        call('a', 'find_elements', { queries: ['Beta', 'x', 'y', 'z', 'trop'], within: -5 }),
        call('b', 'inspect_regions', { regions: [3, 3, 4, 5, 6], depth: 9 }),
      ],
      (text) => labels.push(text),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]!.type).toBe('investigate');
    expect(sent[0]!.payload).toEqual({
      distillId: 7,
      calls: [
        { tool: 'find_elements', queries: ['Beta', 'x', 'y', 'z'], within: -1 },
        { tool: 'inspect_regions', regions: [3, 4, 5], depth: 3 },
      ],
    });
    expect(messages.map((m) => m.role === 'tool' && m.tool_call_id)).toEqual(['a', 'b']);
    expect(messages[0]!.content).toMatch(
      /^<untrusted_tool_result name="find_elements">\nfind_elements: résultat/,
    );
    expect(labels).toEqual(['label find_elements', 'label inspect_regions']);
  });

  it('arguments invalides ou outil inconnu : une erreur en résultat, sans appel à la page', async () => {
    stubChrome('https://example.com/a');
    const messages = await executeToolCalls(1, 'example.com', 1, [
      call('a', 'find_elements', '{pas du json'),
      call('b', 'inspect_regions', { regions: 'x', depth: 1 }),
      call('c', 'rm_rf', {}),
      call('d', 'load_skill', { name: 'inexistant' }),
    ]);
    expect(sent).toHaveLength(0);
    expect(messages.map((m) => String(m.content))).toEqual([
      expect.stringContaining('not valid JSON'),
      expect.stringContaining('invalid inspect_regions'),
      expect.stringContaining('unknown tool "rm_rf"'),
      expect.stringContaining('unknown guide'),
    ]);
  });

  it('load_skill lit un guide de technique sans toucher à la page, et il n’est pas encadré', async () => {
    stubChrome('https://example.com/a');
    const names = toolSpecs().map((spec) => spec.name);
    expect(names).toContain('load_skill');
    const [message] = await executeToolCalls(1, 'example.com', 1, [
      call('a', 'load_skill', { name: 'sticky' }),
    ]);
    expect(sent).toHaveLength(0);
    expect(String(message!.content)).toMatch(/^<skill name="sticky">\n- Make something stick/);
  });

  it('tronque chaque résultat et l’ensemble du tour', async () => {
    stubChrome('https://example.com/a', 'x'.repeat(5000));
    const messages = await executeToolCalls(
      1,
      'example.com',
      1,
      ['a', 'b', 'c', 'd'].map((id) => call(id, 'find_elements', { queries: [id], within: -1 })),
    );
    const sizes = messages.map((m) => String(m.content).length);
    expect(Math.max(...sizes)).toBeLessThan(MAX_RESULT_CHARS + 100);
    expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThan(6_000 + 4 * 500);
    expect(String(messages[0]!.content)).toContain('truncated');
  });

  it('refuse d’examiner un site sensible ou un onglet parti ailleurs', async () => {
    stubChrome('https://www.paypal.com/myaccount');
    await expect(
      executeToolCalls(1, 'www.paypal.com', 1, [
        call('a', 'find_elements', { queries: ['x'], within: -1 }),
      ]),
    ).rejects.toThrow(/another page/);
    stubChrome('https://other.example/a');
    await expect(
      executeToolCalls(1, 'example.com', 1, [
        call('a', 'find_elements', { queries: ['x'], within: -1 }),
      ]),
    ).rejects.toThrow(/another page/);
    expect(sent).toHaveLength(0);
  });
});

describe('requestQueries (pré-recherche)', () => {
  it('garde les libellés cités, puis les mots rares', () => {
    expect(requestQueries('Cache le bouton « Ajouter au panier »')).toEqual(['Ajouter au panier']);
    expect(requestQueries('Cache le bouton Star')).toEqual(['Star']);
    expect(requestQueries('Hide the "Sponsored" labels and the Beta badge')).toEqual([
      'Sponsored',
      'labels',
      'Beta',
    ]);
    expect(requestQueries('Mets le titre principal en rouge')).toEqual(['principal', 'rouge']);
    expect(requestQueries('Mode sombre')).toEqual([]);
  });
});

describe('outils dans la réponse JSON (fournisseurs sans outils natifs)', () => {
  const call = { queries: [], within: -1, regions: [], depth: 1, skill: '' };
  it('lit une étape : outils demandés, recette finale, ou recette nue', () => {
    expect(
      parseAgentStep({
        understanding: 'u',
        tool_calls: [{ ...call, name: 'find_elements', queries: ['Beta'] }],
        recipe: null,
      }),
    ).toEqual({ kind: 'tools', calls: [{ ...call, name: 'find_elements', queries: ['Beta'] }] });
    expect(
      parseAgentStep({
        understanding: 'u',
        tool_calls: [],
        recipe: { changes: [], explanation: 'e' },
      }),
    ).toEqual({ kind: 'answer', value: { understanding: 'u', changes: [], explanation: 'e' } });
    expect(parseAgentStep({ changes: [], explanation: 'nue' })).toEqual({
      kind: 'answer',
      value: { changes: [], explanation: 'nue' },
    });
    expect(() => parseAgentStep({ tool_calls: [], recipe: null })).toThrow(/no recipe/);
    expect(() => parseAgentStep({ tool_calls: [{ name: 'rm' }], recipe: null })).toThrow();
  });

  it('convertit les appels au format natif, avec les seuls arguments de chaque outil', () => {
    expect(
      jsonToolCalls([
        { ...call, name: 'find_elements', queries: ['Beta'], within: 4 },
        { ...call, name: 'inspect_regions', regions: [2], depth: 2 },
        { ...call, name: 'load_skill', skill: 'hide' },
      ]).map((c) => [c.function.name, JSON.parse(c.function.arguments)]),
    ).toEqual([
      ['find_elements', { queries: ['Beta'], within: 4 }],
      ['inspect_regions', { regions: [2], depth: 2 }],
      ['load_skill', { name: 'hide' }],
    ]);
  });
});
