import { describe, expect, it } from 'vitest';
import { cssForSection, readCompiled, sectionOf } from '../src/shared/section';

describe('sections', () => {
  it.each([
    ['/watch', 'watch'],
    ['/results', 'results'],
    ['/wiki/Golden_ratio', 'wiki'],
    ['/', 'home'],
    ['', 'home'],
    ['/Café', 'caf'],
  ])('sectionOf(%s) = %s', (path, expected) => expect(sectionOf(path)).toBe(expected));

  it('readCompiled accepte l’ancien format (chaîne) et le nouveau (objet)', () => {
    expect(readCompiled('h1{}')).toEqual({ '*': 'h1{}' });
    expect(readCompiled('')).toEqual({});
    expect(readCompiled({ '*': 'a{}', watch: 'b{}', bad: 3 })).toEqual({
      '*': 'a{}',
      watch: 'b{}',
    });
    expect(readCompiled(undefined)).toEqual({});
  });

  it('cssForSection = commun + section', () => {
    const compiled = { '*': 'a{}', watch: 'b{}', results: 'c{}' };
    expect(cssForSection(compiled, 'watch')).toBe('a{}\nb{}');
    expect(cssForSection(compiled, 'home')).toBe('a{}');
  });
});
