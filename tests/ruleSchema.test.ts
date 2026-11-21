import { describe, expect, it } from 'vitest';
import { makeExport, parseExport } from '../src/shared/ruleSchema';
import type { Rule } from '../src/shared/types';

const rule: Rule = {
  id: 'r_abc123',
  kind: 'restyle',
  createdAt: '2026-11-21T00:00:00Z',
  prompt: 'cache les commentaires',
  urlPattern: 'https://example.com/*',
  enabled: true,
  ops: [{ op: 'hide', target: 't1' }],
  targets: { t1: { selectors: ['#comments'], minMatches: 1 } },
  css: '',
  explanation: '',
  intent: null,
  health: { lastOk: null, failures: 0, status: 'ok' },
};

describe('export / import', () => {
  it('aller-retour', () => {
    const file = JSON.parse(JSON.stringify(makeExport([{ host: 'example.com', rules: [rule] }])));
    expect(parseExport(file)).toEqual([{ host: 'example.com', rules: [rule] }]);
  });

  it('rejette un mauvais format', () => {
    expect(() => parseExport({ format: 'autre', sites: [] })).toThrow(/Fichier invalide/);
  });

  it('rejette une op inconnue ou un hôte bizarre', () => {
    const bad = makeExport([
      { host: 'example.com', rules: [{ ...rule, ops: [{ op: 'script' as 'hide' }] }] },
    ]);
    expect(() => parseExport(bad)).toThrow();
    expect(() => parseExport(makeExport([{ host: 'evil/../x', rules: [] }]))).toThrow();
  });
});
