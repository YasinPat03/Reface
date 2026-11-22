import { describe, expect, it } from 'vitest';
import { contrast, luminance } from '../src/content/qualityCheck';

describe('contraste (WCAG)', () => {
  it('noir sur blanc = 21:1, identique = 1:1', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
    expect(contrast([120, 120, 120], [120, 120, 120])).toBeCloseTo(1, 5);
  });
  it('est symétrique', () => {
    expect(contrast([37, 99, 166], [0, 0, 0])).toBeCloseTo(contrast([0, 0, 0], [37, 99, 166]), 5);
  });
  it('détecte les cas mesurés sur Hacker News', () => {
    // Liens noirs sur la barre bleue générée : illisible (< 4,5:1).
    expect(contrast([0, 0, 0], [37, 99, 166])).toBeLessThan(4.5);
    // Gris d'origine de HN sur son fond beige : déjà sous le seuil avant toute modif.
    expect(contrast([130, 130, 130], [246, 246, 239])).toBeLessThan(4.5);
    // Blanc sur bleu foncé : lisible.
    expect(contrast([255, 255, 255], [36, 54, 75])).toBeGreaterThan(4.5);
  });
  it('luminance relative bornée entre 0 et 1', () => {
    expect(luminance([0, 0, 0])).toBe(0);
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 5);
  });
});
