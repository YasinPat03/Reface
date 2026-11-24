import { describe, expect, it } from 'vitest';
import { describeSavedRules, ruleSelectors } from '../src/background/agent';
import type { Rule } from '../src/shared/types';

const rule = (fields: Partial<Rule>): Rule => ({
  id: 'r1',
  kind: 'restyle',
  createdAt: '2026-11-23T10:00:00Z',
  prompt: 'Cache les Shorts',
  urlPattern: 'https://www.youtube.com/*',
  enabled: true,
  ops: [],
  targets: {},
  css: '',
  explanation: '',
  intent: null,
  health: { lastOk: null, failures: 0, status: 'ok' },
  ...fields,
});

describe('mémoire du site (règles gardées envoyées au LLM)', () => {
  it('reprend les cibles des ops puis les sélecteurs du CSS', () => {
    const r = rule({
      ops: [{ op: 'hide', target: 't1' }],
      targets: { t1: { selectors: ['#secondary', 'div#secondary'], minMatches: 1 } },
      css: 'grid-shelf-view-model, ytd-reel-shelf-renderer{display:none !important}\n:root{--x:1px}',
    });
    expect(ruleSelectors(r)).toEqual(['#secondary', 'grid-shelf-view-model']);
  });

  it('donne le nombre d’éléments visés sur la page courante', () => {
    const r = rule({ title: 'Hide Shorts', css: 'grid-shelf-view-model{display:none}' });
    expect(describeSavedRules([r], { 'grid-shelf-view-model': 2 })).toBe(
      '- "Hide Shorts" → "grid-shelf-view-model" (×2 here)',
    );
    expect(describeSavedRules([rule({ prompt: 'Mode sombre' })])).toBe('- "Mode sombre"');
  });

  it('se limite aux 8 dernières règles et à 160 caractères par ligne', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      rule({ id: `r${i}`, prompt: `règle ${i} ${'x'.repeat(200)}`, css: `.c${i}{color:red}` }),
    );
    const lines = describeSavedRules(many).split('\n');
    expect(lines).toHaveLength(8);
    expect(lines[0]).toContain('règle 4');
    expect(lines.every((line) => line.length <= 160)).toBe(true);
  });
});
