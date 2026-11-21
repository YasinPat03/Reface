import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyCatalogueEntry,
  capturePage,
  CATALOGUE_PREFIX,
  getPrivateCatalogue,
  matchesPage,
  savePrivateEntry,
} from '../src/shared/catalogue';
import { catalogueEntrySchema, publicEntry } from '../src/shared/catalogueSchema';
import { compilePages, compileSite } from '../src/shared/compile';
import type { Rule } from '../src/shared/types';

export function sampleRule(partial: Partial<Rule> = {}): Rule {
  return {
    id: 'r_original',
    kind: 'restyle',
    createdAt: '2026-11-21T00:00:00.000Z',
    prompt: 'Private original prompt',
    urlPattern: 'https://example.com/*',
    pagePath: '/article',
    enabled: true,
    ops: [{ op: 'style', target: 't1', css: { 'font-size': '20px' } }],
    targets: {
      t1: {
        selectors: ['main p'],
        minMatches: 1,
        fingerprint: {
          tag: 'p',
          id: null,
          classes: [],
          role: null,
          ariaLabel: null,
          textSample: 'Private page text',
          childCount: 0,
        },
      },
    },
    css: '',
    explanation: 'Private explanation',
    intent: null,
    health: { lastOk: null, failures: 0, status: 'ok' },
    ...partial,
  };
}
function entry() {
  return capturePage(
    { host: 'example.com', rules: [sampleRule()] },
    'https://example.com/article?private=secret#section',
    'Lecture',
    'Un texte plus facile à lire.',
  );
}
let stored: Record<string, unknown>;
beforeEach(() => {
  stored = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (keys: string | null) =>
          keys === null ? structuredClone(stored) : { [keys]: structuredClone(stored[keys]) },
        ),
        set: vi.fn(async (patch: Record<string, unknown>) => {
          Object.assign(stored, structuredClone(patch));
        }),
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('private and public catalogue', () => {
  it('captures only enabled modifications from the saved page, excluding query strings and page text', () => {
    const theme = capturePage(
      {
        host: 'example.com',
        rules: [
          sampleRule(),
          sampleRule({ id: 'r_disabled', enabled: false }),
          sampleRule({ id: 'r_other', pagePath: '/other', scope: 'page' }),
        ],
      },
      'https://example.com/article?private=secret#section',
      'Lecture',
      'Une description.',
    );
    expect(theme.rules).toHaveLength(1);
    expect(theme.pageUrl).toBe('https://example.com/article');
    expect(theme.rules[0]!.targets.t1!.fingerprint).toBeUndefined();
    expect(JSON.stringify(theme)).not.toMatch(/Private|private=secret/);
  });
  it('rejects empty snapshots and invalid publication metadata', () => {
    expect(() =>
      capturePage(
        { host: 'example.com', rules: [] },
        'https://example.com/',
        'Title',
        'Description',
      ),
    ).toThrow();
    expect(catalogueEntrySchema.safeParse({ ...entry(), title: ' ' }).success).toBe(false);
    expect(catalogueEntrySchema.safeParse({ ...entry(), description: '' }).success).toBe(false);
    expect(
      catalogueEntrySchema.safeParse({ ...entry(), pageUrl: 'javascript:alert(1)' }).success,
    ).toBe(false);
    expect(catalogueEntrySchema.safeParse({ ...entry(), pageUrl: 'invalid' }).success).toBe(false);
    expect(
      catalogueEntrySchema.safeParse({
        ...entry(),
        pageUrl: 'https://user:password@example.com/article',
      }).success,
    ).toBe(false);
    expect(
      catalogueEntrySchema.safeParse({ ...entry(), pageUrl: 'https://other.example/article' })
        .success,
    ).toBe(false);
  });
  it('stores separate entries without changing active page rules or overwriting another save', async () => {
    const first = entry(),
      second = entry();
    await Promise.all([savePrivateEntry(first), savePrivateEntry(second)]);
    expect(await getPrivateCatalogue()).toHaveLength(1);
    expect(Object.keys(stored).every((key) => key.startsWith(CATALOGUE_PREFIX))).toBe(true);
    await savePrivateEntry(first);
    expect(await getPrivateCatalogue()).toHaveLength(1);
  });
  it('applies a theme idempotently, keeps unrelated rules, and writes page CSS atomically', async () => {
    const theme = entry();
    stored['rules:example.com'] = {
      host: 'example.com',
      rules: [sampleRule({ id: 'r_unrelated', css: 'h1{color:blue}' })],
    };
    await savePrivateEntry(theme);
    await applyCatalogueEntry(theme, 'https://example.com/article?different=1');
    await applyCatalogueEntry(theme, 'https://example.com/article');
    const rules = (stored['rules:example.com'] as { rules: Rule[] }).rules;
    expect(rules).toHaveLength(2);
    expect(rules.some((rule) => rule.id === 'r_unrelated')).toBe(true);
    expect(JSON.stringify(stored['css:example.com'])).not.toContain('r_cat_');
    expect(stored['page-css:example.com']).toEqual({
      'https://example.com/article': expect.stringContaining('font-size:20px!important'),
    });
    expect(vi.mocked(chrome.storage.local.set).mock.calls.at(-1)![0]).toHaveProperty(
      'page-css:example.com',
    );
  });
  it('does not reimport a publication with a new ID and title but identical styles', async () => {
    const original = entry();
    await savePrivateEntry(original);
    await savePrivateEntry({ ...original, id: 'c_published', title: 'Public title' });
    expect(await getPrivateCatalogue()).toHaveLength(1);
  });
  it('bundles all imported styles into one toggleable rule', async () => {
    const theme = entry();
    theme.rules.push(
      sampleRule({ id: 'r_second', ops: [{ op: 'theme', css: { color: '#222222' } }] }),
    );
    await applyCatalogueEntry(theme, theme.pageUrl);
    const rules = (stored['rules:example.com'] as { rules: Rule[] }).rules;
    expect(rules).toHaveLength(1);
    expect(rules[0]!.css).toContain('font-size:20px');
    expect(rules[0]!.css).toContain('color:#222222');
  });
  it('recognizes a theme after applying, recapturing duplicated styles, and publishing again', async () => {
    const original = entry();
    await savePrivateEntry(original);
    await applyCatalogueEntry(original, original.pageUrl);
    const rules = (stored['rules:example.com'] as { rules: Rule[] }).rules;
    const recaptured = capturePage(
      { host: original.host, rules: [sampleRule(), ...rules] },
      original.pageUrl,
      'Renamed',
      'Republished description',
    );
    await savePrivateEntry({ ...recaptured, id: 'c_republished' });
    expect(await getPrivateCatalogue()).toHaveLength(1);
  });
  it('does not apply a theme to another site, path, scheme, or port', async () => {
    const theme = entry();
    for (const url of [
      'https://other.example/article',
      'https://example.com/other',
      'http://example.com/article',
      'https://example.com:444/article',
    ]) {
      expect(matchesPage(theme, url)).toBe(false);
      await expect(applyCatalogueEntry(theme, url)).rejects.toThrow(/page indiquée/);
    }
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
  it('publications preserve styles while replacing original prompts with publication metadata', () => {
    const theme = entry();
    theme.rules[0]!.prompt = 'A private request';
    const published = publicEntry({
      ...theme,
      title: 'À partager',
      description: 'Une description publique.',
    });
    expect(published.rules[0]!.prompt).toBe('À partager');
    expect(published.rules[0]!.ops).toEqual(theme.rules[0]!.ops);
  });
});

describe('page-specific replay', () => {
  it('keeps page rules out of global CSS and distinguishes origins and paths', () => {
    const rules = [
      sampleRule({ id: 'r_global', pagePath: undefined }),
      sampleRule({ id: 'r_page', scope: 'page', urlPattern: 'https://example.com/article' }),
      sampleRule({ id: 'r_port', scope: 'page', urlPattern: 'https://example.com:444/article' }),
      sampleRule({ id: 'r_off', scope: 'page', enabled: false }),
    ];
    expect(JSON.stringify(compileSite(rules))).toContain('r_global');
    expect(JSON.stringify(compileSite(rules))).not.toContain('r_page');
    expect(Object.keys(compilePages(rules))).toEqual([
      'https://example.com/article',
      'https://example.com:444/article',
    ]);
    expect(compilePages(rules)['https://example.com/article']).not.toContain('r_port');
  });
  it('does not compile unsafe CSS from a public theme into the page', () => {
    const rules = [
      sampleRule({
        scope: 'page',
        urlPattern: 'https://example.com/article',
        ops: [],
        css: '@import "https://evil.example/track.css";',
      }),
    ];
    expect(compilePages(rules)['https://example.com/article']).not.toContain('@import');
    expect(compileSite(rules)).toEqual({});
  });
});
