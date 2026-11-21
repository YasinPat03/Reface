import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

let source: string;
beforeAll(async () => {
  const injector = await readFile(
    new URL('../src/injector/index.iife.ts', import.meta.url),
    'utf8',
  );
  const section = await readFile(new URL('../src/shared/section.ts', import.meta.url), 'utf8');
  const raw = section.replace(/export /g, '') + injector.replace(/^import .*;\r?\n/m, '');
  source = ts.transpileModule(raw, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
});

async function fixture(data: Record<string, unknown>, pathname = '/article') {
  const location = { hostname: 'example.com', origin: 'https://example.com', pathname };
  let style: { id: string; textContent: string; disabled: boolean; isConnected: boolean } | null =
    null;
  let routeCheck: () => void = () => undefined;
  let changed: (patch: Record<string, { newValue: unknown }>, area: string) => void = () =>
    undefined;
  runInNewContext(source, {
    location,
    addEventListener: () => undefined,
    window: {},
    chrome: {
      storage: {
        local: { get: async () => data },
        onChanged: {
          addListener: (callback: typeof changed) => {
            changed = callback;
          },
        },
      },
    },
    document: {
      documentElement: {
        hasAttribute: () => false,
        appendChild: (value: NonNullable<typeof style>) => {
          value.isConnected = true;
          style = value;
        },
      },
      createElement: () => ({ id: '', textContent: '', disabled: false, isConnected: false }),
      addEventListener: () => undefined,
    },
    setInterval: (callback: () => void) => {
      routeCheck = callback;
    },
    MutationObserver: class {
      observe() {}
    },
  });
  await Promise.resolve();
  return {
    css: () => style?.textContent ?? '',
    navigate: (path: string, origin = location.origin) => {
      location.pathname = path;
      location.origin = origin;
      routeCheck();
    },
    change: (patch: Record<string, { newValue: unknown }>) => changed(patch, 'local'),
  };
}

describe('page-specific injector replay', () => {
  it('loads global and matching page CSS, then removes only page CSS on SPA navigation', async () => {
    const page = await fixture({
      'css:example.com': 'body{color:black}',
      'page-css:example.com': { 'https://example.com/article': 'p{font-size:20px}' },
    });
    expect(page.css()).toBe('body{color:black}\np{font-size:20px}');
    page.navigate('/other');
    expect(page.css()).toBe('body{color:black}');
    page.navigate('/article');
    expect(page.css()).toContain('font-size:20px');
    page.navigate('/article', 'https://example.com:444');
    expect(page.css()).toBe('body{color:black}');
  });
  it('responds to pause, reactivation, and removal of a page theme', async () => {
    const page = await fixture({
      'page-css:example.com': { 'https://example.com/article': 'p{color:blue}' },
      'paused:example.com': true,
    });
    expect(page.css()).toBe('');
    page.change({ 'paused:example.com': { newValue: false } });
    expect(page.css()).toBe('p{color:blue}');
    page.change({ 'page-css:example.com': { newValue: {} } });
    expect(page.css()).toBe('');
  });
  it('does not apply a theme before reaching its saved path', async () => {
    const page = await fixture(
      { 'page-css:example.com': { 'https://example.com/article': 'p{color:blue}' } },
      '/',
    );
    expect(page.css()).toBe('');
    page.navigate('/article');
    expect(page.css()).toBe('p{color:blue}');
  });
});
