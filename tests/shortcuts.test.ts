import { describe, expect, it } from 'vitest';
import {
  MAX_LABEL,
  hotkeyAction,
  newShortcutId,
  renamed,
  shortcutLabel,
  shortcutPath,
  shortcutUrl,
  stepIndex,
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

describe('hotkeyAction (⌘⇧E)', () => {
  const web = 'https://example.com/a';

  it('démarre sur une page web sans enregistrement', () => {
    expect(hotkeyAction(null, 1, web)).toBe('start');
  });

  it('enregistre si l’onglet est celui de l’enregistrement', () => {
    expect(hotkeyAction({ tabId: 1 }, 1, web)).toBe('save');
  });

  it('redémarre sur cet onglet si l’enregistrement est ailleurs', () => {
    expect(hotkeyAction({ tabId: 2 }, 1, web)).toBe('start');
  });

  it.each(['chrome://extensions', 'about:blank', ''])('refuse une page non web (%s)', (url) => {
    expect(hotkeyAction(null, 1, url)).toBe('refuse');
    expect(hotkeyAction({ tabId: 2 }, 1, url)).toBe('refuse');
  });
});

describe('stepIndex (palette ⌘⇧X)', () => {
  it('↓ et ↑ bouclent aux deux bouts', () => {
    expect(stepIndex(0, 'ArrowDown', 3)).toBe(1);
    expect(stepIndex(2, 'ArrowDown', 3)).toBe(0);
    expect(stepIndex(0, 'ArrowUp', 3)).toBe(2);
    expect(stepIndex(1, 'ArrowUp', 3)).toBe(0);
  });

  it('Début et Fin', () => {
    expect(stepIndex(1, 'Home', 3)).toBe(0);
    expect(stepIndex(1, 'End', 3)).toBe(2);
  });

  it('liste vide : -1 ; autre touche : sélection inchangée', () => {
    expect(stepIndex(-1, 'ArrowDown', 0)).toBe(-1);
    expect(stepIndex(1, 'a', 3)).toBe(1);
  });

  it('sans sélection : ↓ part du haut, ↑ du bas', () => {
    expect(stepIndex(-1, 'ArrowDown', 3)).toBe(0);
    expect(stepIndex(-1, 'ArrowUp', 3)).toBe(2);
  });
});

describe('shortcutPath', () => {
  it('chemin décodé, avec requête et ancre', () => {
    expect(shortcutPath('https://a.com/compte/r%C3%A9glages?onglet=2#ssh')).toBe(
      '/compte/réglages?onglet=2#ssh',
    );
  });

  it('séquence % invalide ou URL invalide : texte brut', () => {
    expect(shortcutPath('https://a.com/100%')).toBe('/100%');
    expect(shortcutPath('pas une url')).toBe('pas une url');
  });
});
