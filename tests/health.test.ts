import { describe, expect, it } from 'vitest';
import { pathTemplate } from '../src/content/health';

describe('pathTemplate', () => {
  it.each([
    ['/watch', '/watch'],
    ['/products/123456/reviews', '/products/*/reviews'],
    ['/u/9f8e7d6c-5b4a-3210-fedc-ba9876543210/', '/u/*'],
    ['/', ''],
    ['/wiki/Golden_ratio', '/wiki/Golden_ratio'],
  ])('%s → %s', (path, expected) => expect(pathTemplate(path)).toBe(expected));
});
