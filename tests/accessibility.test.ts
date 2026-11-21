import { describe, expect, it } from 'vitest';
import {
  compileAccessibility,
  readAccessibility,
  DEFAULT_ACCESSIBILITY,
} from '../src/shared/accessibility';

describe('accessibility preferences', () => {
  it('starts and resets without changing the page', () => {
    expect(compileAccessibility(DEFAULT_ACCESSIBILITY)).toBe('');
    expect(readAccessibility(null)).toEqual(DEFAULT_ACCESSIBILITY);
  });
  it('bounds persisted values and rejects injected CSS', () => {
    const settings = readAccessibility({
      textSize: 100,
      targetSize: -5,
      spacing: Infinity,
      contrast: 'red;}body{display:none',
      vision: 'true',
    });
    expect(settings.textSize).toBe(28);
    expect(settings.targetSize).toBe(44);
    expect(settings.spacing).toBe(4);
    expect(settings.contrast).toBe('original');
    expect(settings.vision).toBe(false);
  });
  it('combines modes and keeps original colors unless requested', () => {
    const css = compileAccessibility({
      ...DEFAULT_ACCESSIBILITY,
      vision: true,
      color: true,
      motor: true,
    });
    expect(css).toContain('18px');
    expect(css).toContain('min-height:44px');
    expect(css).toContain('border:3px dashed');
    expect(css).toContain('text-decoration-line:underline');
    expect(css).not.toContain('background-color');
    expect(css).not.toContain('transform:');
  });
  it('uses an explicit high contrast palette only for low vision', () => {
    expect(compileAccessibility({ vision: true, contrast: 'dark' })).toContain('#17191c');
    expect(compileAccessibility({ color: true, contrast: 'dark' })).not.toContain('#17191c');
  });
});
