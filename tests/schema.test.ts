import { describe, expect, it } from 'vitest';
import { parseRecipe, toWire } from '../src/shared/schema';

const valid = {
  ops: [
    { op: 'hide', target: 't1', declarations: [] },
    { op: 'theme', target: '', declarations: [{ property: 'background', value: '#111' }] },
  ],
  targets: [{ key: 't1', regionIndex: 4, selectorHints: ['#comments'] }],
  css: '',
  explanation: 'Cache les commentaires.',
};

describe('parseRecipe', () => {
  it('convertit le format fil en recette interne', () => {
    const recipe = parseRecipe(valid);
    expect(recipe.ops).toEqual([
      { op: 'hide', target: 't1' },
      { op: 'theme', css: { background: '#111' } },
    ]);
    expect(recipe.targets.t1).toEqual({
      regionIndex: 4,
      selectorHints: ['#comments'],
      scope: 'one',
    });
  });

  it('aller-retour toWire → parseRecipe', () => {
    const recipe = parseRecipe(valid);
    expect(parseRecipe(toWire(recipe))).toEqual(recipe);
  });

  it('rejette une op inconnue', () => {
    expect(() =>
      parseRecipe({ ...valid, ops: [{ op: 'script', target: 't1', declarations: [] }] }),
    ).toThrow(/format/);
  });

  it('rejette une cible inconnue', () => {
    expect(() =>
      parseRecipe({ ...valid, ops: [{ op: 'hide', target: 'zz', declarations: [] }] }),
    ).toThrow(/inconnue/);
  });

  it('rejette hide sans cible', () => {
    expect(() =>
      parseRecipe({ ...valid, ops: [{ op: 'hide', target: '', declarations: [] }] }),
    ).toThrow(/cible/);
  });

  it('rejette des champs en trop ou manquants', () => {
    expect(() => parseRecipe({ ops: [] })).toThrow();
    expect(() => parseRecipe('pas du json')).toThrow();
  });
});
