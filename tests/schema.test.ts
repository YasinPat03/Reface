import { describe, expect, it } from 'vitest';
import { parseRecipe, parseReview, toWire } from '../src/shared/schema';

const legacy = {
  ops: [
    { op: 'hide', target: 't1', declarations: [] },
    { op: 'theme', target: '', declarations: [{ property: 'background', value: '#111' }] },
  ],
  targets: [{ key: 't1', regionIndex: 4, selectorHints: ['#comments'] }],
  css: '',
  explanation: 'Cache les commentaires.',
};

const multi = {
  changes: [
    {
      title: 'Cacher les commentaires',
      ops: [{ op: 'hide', target: 't1', declarations: [] }],
      targets: [{ key: 't1', regionIndex: 4, selectorHints: ['#comments'], scope: 'one' }],
      css: '',
    },
    {
      title: 'Titre en rouge',
      ops: [{ op: 'style', target: 't1', declarations: [{ property: 'color', value: 'red' }] }],
      targets: [{ key: 't1', regionIndex: 1, selectorHints: ['h1'], scope: 'one' }],
      css: '',
    },
    { title: 'Texte plus grand', ops: [], targets: [], css: 'main p{font-size:20px}' },
  ],
  explanation: 'Trois modifications.',
};

describe('parseRecipe', () => {
  it('sépare un prompt en plusieurs changements, chacun avec ses propres cibles', () => {
    const recipe = parseRecipe(multi);
    expect(recipe.changes.map((c) => c.title)).toEqual([
      'Cacher les commentaires',
      'Titre en rouge',
      'Texte plus grand',
    ]);
    // La même clé t1 désigne une cible différente dans chaque changement.
    expect(recipe.changes[0]!.targets.t1!.regionIndex).toBe(4);
    expect(recipe.changes[1]!.targets.t1!.regionIndex).toBe(1);
    expect(recipe.changes[1]!.ops).toEqual([{ op: 'style', target: 't1', css: { color: 'red' } }]);
    expect(recipe.changes[2]!.css).toBe('main p{font-size:20px}');
  });

  it('normalise une clé de cible invalide au lieu de rejeter toute la réponse', () => {
    const recipe = parseRecipe({
      changes: [
        {
          title: 'Titre rouge',
          ops: [
            {
              op: 'style',
              target: 'titre-principal',
              declarations: [{ property: 'color', value: 'red' }],
            },
          ],
          targets: [{ key: 'titre-principal', regionIndex: 7, selectorHints: [], scope: 'one' }],
          css: '',
        },
      ],
      explanation: 'Rouge.',
    });
    expect(recipe.changes[0]!.targets.titre_principal!.regionIndex).toBe(7);
    expect(recipe.changes[0]!.ops[0]!.target).toBe('titre_principal');
  });

  it('ignore les changements vides', () => {
    const recipe = parseRecipe({
      ...multi,
      changes: [...multi.changes, { title: 'Rien', ops: [], targets: [], css: ' ' }],
    });
    expect(recipe.changes).toHaveLength(3);
  });

  it('accepte encore l’ancien format plat, comme un seul changement', () => {
    const recipe = parseRecipe(legacy);
    expect(recipe.changes).toHaveLength(1);
    expect(recipe.changes[0]!.ops).toEqual([
      { op: 'hide', target: 't1' },
      { op: 'theme', css: { background: '#111' } },
    ]);
    expect(recipe.changes[0]!.targets.t1).toEqual({
      regionIndex: 4,
      selectorHints: ['#comments'],
      scope: 'one',
    });
    expect(recipe.changes[0]!.title).toBe('Cache les commentaires.');
  });

  it('aller-retour toWire → parseRecipe', () => {
    for (const raw of [legacy, multi]) {
      const recipe = parseRecipe(raw);
      expect(parseRecipe(toWire(recipe))).toEqual(recipe);
    }
  });

  it('rejette une op inconnue', () => {
    expect(() =>
      parseRecipe({ ...legacy, ops: [{ op: 'script', target: 't1', declarations: [] }] }),
    ).toThrow(/format/);
  });

  it('rejette une cible inconnue, y compris celle d’un autre changement', () => {
    expect(() =>
      parseRecipe({ ...legacy, ops: [{ op: 'hide', target: 'zz', declarations: [] }] }),
    ).toThrow(/inconnue/);
    const [first, second] = multi.changes;
    expect(() =>
      parseRecipe({
        ...multi,
        changes: [first, { ...second!, ops: [{ op: 'hide', target: 't2', declarations: [] }] }],
      }),
    ).toThrow(/inconnue/);
  });

  it('rejette hide sans cible', () => {
    expect(() =>
      parseRecipe({ ...legacy, ops: [{ op: 'hide', target: '', declarations: [] }] }),
    ).toThrow(/cible/);
  });

  it('rejette des champs en trop ou manquants', () => {
    expect(() => parseRecipe({ ops: [] })).toThrow();
    expect(() => parseRecipe({ changes: [{ title: 'x' }], explanation: '' })).toThrow();
    expect(() => parseRecipe('pas du json')).toThrow();
  });
});

describe('parseReview (affinage visuel)', () => {
  it('lit les défauts et le verdict, en ignorant le reste de la recette', () => {
    expect(
      parseReview({ review: { defects: ['cartes trop hautes', 3], clean: false }, changes: [] }),
    ).toEqual({ defects: ['cartes trop hautes'], clean: false });
  });
  it('sans critique valide : pas de défaut, pas propre', () => {
    expect(parseReview({ changes: [] })).toEqual({ defects: [], clean: false });
    expect(parseReview(null)).toEqual({ defects: [], clean: false });
  });
});
