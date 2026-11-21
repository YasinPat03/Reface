import { describe, expect, it } from 'vitest';
import {
  MAX_LABEL,
  newShortcutId,
  renamed,
  shortcutLabel,
  shortcutUrl,
  withShortcut,
  without,
  type SiteShortcuts,
} from '../src/shared/shortcuts';

const empty: SiteShortcuts = { host: 'example.com', shortcuts: [] };
const NOW = '2026-11-21T10:00:00.000Z';

describe('shortcutUrl', () => {
  it.each([
    ['https://example.com/a/b?x=1#y', 'https://example.com/a/b?x=1#y'],
    ['http://example.com', 'http://example.com/'],
  ])('accepte %s', (raw, expected) => expect(shortcutUrl(raw)).toBe(expected));

  it.each([
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'chrome://extensions',
    'file:///etc/passwd',
    'chrome-extension://abc/page.html',
    'pas une url',
    '',
  ])('refuse %s', (raw) => expect(shortcutUrl(raw)).toBeNull());
});

describe('shortcutLabel', () => {
  it('reprend le titre nettoyé', () => {
    expect(shortcutLabel('  Mes   commandes \n', 'https://a.com/x')).toBe('Mes commandes');
  });

  it(`tronque à ${MAX_LABEL} caractères`, () => {
    const label = shortcutLabel('x'.repeat(200), 'https://a.com/');
    expect(label).toHaveLength(MAX_LABEL);
    expect(label.endsWith('…')).toBe(true);
  });

  it('se rabat sur le chemin, puis sur le host pour l’accueil', () => {
    expect(shortcutLabel('', 'https://a.com/compte/r%C3%A9glages?onglet=2')).toBe(
      '/compte/réglages?onglet=2',
    );
    expect(shortcutLabel('   ', 'https://a.com/')).toBe('a.com');
  });
});

describe('withShortcut', () => {
  it('ajoute un raccourci, puis ignore un doublon', () => {
    const first = withShortcut(
      empty,
      { url: 'https://example.com/deep', title: 'Profonde' },
      's_1',
      NOW,
    );
    expect(first.added).toBe(true);
    expect(first.site.shortcuts).toEqual([
      { id: 's_1', label: 'Profonde', url: 'https://example.com/deep', createdAt: NOW },
    ]);

    const again = withShortcut(
      first.site,
      { url: 'https://example.com/deep', title: 'Autre' },
      's_2',
      NOW,
    );
    expect(again.added).toBe(false);
    expect(again.shortcut.id).toBe('s_1');
    expect(again.site.shortcuts).toHaveLength(1);
  });

  it('refuse une page qui n’est pas http(s)', () => {
    expect(() => withShortcut(empty, { url: 'chrome://newtab', title: '' }, 's_1', NOW)).toThrow(
      /ne peut pas servir de raccourci/,
    );
  });
});

describe('renamed / without', () => {
  const site = withShortcut(empty, { url: 'https://example.com/a', title: 'A' }, 's_a', NOW).site;

  it('renomme, et garde l’ancien nom si le nouveau est vide', () => {
    expect(renamed(site, 's_a', '  Nouveau  ').shortcuts[0]!.label).toBe('Nouveau');
    expect(renamed(site, 's_a', '   ').shortcuts[0]!.label).toBe('A');
  });

  it('supprime', () => {
    expect(without(site, 's_a').shortcuts).toEqual([]);
    expect(without(site, 's_inconnu').shortcuts).toHaveLength(1);
  });

  it('génère des ids préfixés', () => {
    expect(newShortcutId()).toMatch(/^s_[\w-]{8}$/);
  });
});
