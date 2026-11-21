import { describe, expect, it } from 'vitest';
import { attributePrompts } from '../src/background/agent';
import type { Draft, DraftChange } from '../src/shared/types';

const change = (title: string, color: string, prompt?: string): DraftChange => ({
  title,
  ops: [{ op: 'style', target: 't1', css: { color } }],
  targets: { t1: { selectors: [`#${title.replace(/\W/g, '')}`], minMatches: 1 } },
  css: '',
  enabled: true,
  ...(prompt ? { prompt } : {}),
});

const draft = (prompts: string[], changes: DraftChange[]): Draft => ({
  host: 'example.com',
  prompts,
  recipe: { changes: [], explanation: '' },
  changes,
  explanation: '',
  previewCss: '',
  warnings: [],
});

describe('attributePrompts', () => {
  it('premier prompt : chaque changement reçoit ce prompt', () => {
    const first = attributePrompts(draft(['ajuste x'], [change('X', 'red')]), null, 'ajuste x');
    expect(first.changes[0]!.prompt).toBe('ajuste x');
  });

  it('« ajuste x » puis « ajuste y » : le second changement ne porte que « ajuste y »', () => {
    const previous = draft(['ajuste x'], [change('X', 'red', 'ajuste x')]);
    const next = attributePrompts(
      draft(['ajuste x', 'ajuste y'], [change('X', 'red'), change('Y', 'blue')]),
      previous,
      'ajuste y',
    );
    expect(next.changes.map((c) => c.prompt)).toEqual(['ajuste x', 'ajuste y']);
  });

  it('un changement révisé par le suivi garde son historique', () => {
    const previous = draft(['ajuste x'], [change('X', 'red', 'ajuste x')]);
    const next = attributePrompts(
      draft(['ajuste x', 'plus foncé'], [change('X', 'darkred')]),
      previous,
      'plus foncé',
    );
    expect(next.changes[0]!.prompt).toBe('ajuste x → plus foncé');
  });

  it('un changement décoché ne transmet pas son prompt', () => {
    const previous = draft(['a'], [{ ...change('X', 'red', 'a'), enabled: false }]);
    const next = attributePrompts(draft(['a', 'b'], [change('X', 'red')]), previous, 'b');
    expect(next.changes[0]!.prompt).toBe('b');
  });
});

describe('attributePrompts : réécriture par le LLM', () => {
  it('un changement réécrit à peine pendant l’ajout d’un autre garde son prompt', () => {
    const previous = draft(['ajuste x'], [change('X', 'red', 'ajuste x')]);
    const next = attributePrompts(
      draft(['ajuste x', 'ajuste y'], [change('X', 'rgb(255,0,0)'), change('Y', 'blue')]),
      previous,
      'ajuste y',
    );
    expect(next.changes.map((c) => c.prompt)).toEqual(['ajuste x', 'ajuste y']);
  });
});

describe('attributePrompts : changement unique', () => {
  it('un seul changement avant et après est une révision, même renommé', () => {
    const previous = draft(['mode sombre'], [change('Mode sombre', 'white', 'mode sombre')]);
    const next = attributePrompts(
      draft(['mode sombre', 'moins contrasté'], [change('Thème sombre doux', 'gray')]),
      previous,
      'moins contrasté',
    );
    expect(next.changes[0]!.prompt).toBe('mode sombre → moins contrasté');
  });
});
