import { describe, expect, it } from 'vitest';
import { ACCESSIBILITY_MASTER, compileAccessibility } from '../src/shared/accessibility';

describe('accessibility preferences', () => {
  it('starts with no changes and compiles only enabled adjustments', () => {
    expect(compileAccessibility({})).toBe('');
    const css = compileAccessibility({
      'reface-accessibility:v1:text-size': true,
      'reface-accessibility:v1:line-spacing': false,
      'reface-accessibility:v1:visible-focus': true,
    });
    expect(css).toContain('font-size:');
    expect(css).toContain(':focus-visible');
    expect(css).not.toContain('line-height:');
  });

  it('suspends adjustments when disabled globally', () => {
    expect(
      compileAccessibility({
        [ACCESSIBILITY_MASTER]: false,
        'reface-accessibility:v1:text-size': true,
      }),
    ).toBe('');
  });
});
