import { describe, expect, it } from 'vitest';
import { compileRule, compileSite } from '../src/shared/compile';
import { cssViolation, isSafeDeclaration, isSafeSelector } from '../src/shared/cssSafety';
import type { Rule } from '../src/shared/types';

function rule(partial: Partial<Rule>): Rule {
  return {
    id: 'r_test',
    kind: 'restyle',
    createdAt: '2026-11-21T00:00:00Z',
    prompt: 'test',
    urlPattern: 'https://example.com/*',
    enabled: true,
    ops: [],
    targets: {},
    css: '',
    explanation: '',
    intent: null,
    health: { lastOk: null, failures: 0, status: 'ok' },
    ...partial,
  };
}

describe('compileRule', () => {
  it('compile hide en display:none !important', () => {
    const css = compileRule(
      rule({
        ops: [{ op: 'hide', target: 't1' }],
        targets: { t1: { selectors: ['#comments', 'ytd-comments'], minMatches: 1 } },
      }),
    );
    expect(css).toBe('#comments,ytd-comments{display:none!important}');
  });

  it('compile style avec !important et sans doublon', () => {
    const css = compileRule(
      rule({
        ops: [{ op: 'style', target: 't1', css: { 'Font-Size': '20px !important', color: 'red' } }],
        targets: { t1: { selectors: ['main p'], minMatches: 1 } },
      }),
    );
    expect(css).toBe('main p{font-size:20px!important;color:red!important}');
  });

  it('theme sans cible vise html,body', () => {
    const css = compileRule(rule({ ops: [{ op: 'theme', css: { background: '#111' } }] }));
    expect(css).toBe('html,body{background:#111!important}');
  });

  it('ignore les déclarations et sélecteurs dangereux', () => {
    const css = compileRule(
      rule({
        ops: [
          {
            op: 'style',
            target: 't1',
            css: { background: 'url(https://evil.test/x.png)', color: 'blue' },
          },
          { op: 'hide', target: 't2' },
        ],
        targets: {
          t1: { selectors: ['p'], minMatches: 1 },
          t2: { selectors: ['a}body{display:none'], minMatches: 1 },
        },
      }),
    );
    expect(css).toBe('p{color:blue!important}');
  });

  it('écarte un CSS libre dangereux', () => {
    expect(compileRule(rule({ css: '@import "https://evil.test/x.css";' }))).toBe('');
    expect(compileRule(rule({ css: 'h1{color:green!important}' }))).toBe(
      'h1{color:green!important}',
    );
  });
});

describe('compileSite', () => {
  it('ne garde que les règles activées', () => {
    const css = compileSite([
      rule({ id: 'r_on', css: 'h1{color:red!important}' }),
      rule({ id: 'r_off', enabled: false, css: 'h2{color:red!important}' }),
    ]);
    expect(css).toContain('h1{');
    expect(css).not.toContain('h2{');
  });
});

describe('cssSafety', () => {
  it.each([
    'a{background:url(x)}',
    '@import "x.css";',
    'a::after{content:attr(href)}',
    'a{background:image-set("x" 1x)}',
    'a{color:red}/* */',
    'a{x:javascript:alert(1)}',
    'a{color:\\72 ed}',
  ])('rejette %s', (css) => {
    expect(cssViolation(css)).not.toBeNull();
  });

  it('accepte du CSS ordinaire', () => {
    expect(cssViolation('main{display:grid;grid-template-columns:1fr 2fr}')).toBeNull();
  });

  it('valide propriétés et sélecteurs', () => {
    expect(isSafeDeclaration('color', 'red')).toBe(true);
    expect(isSafeDeclaration('color', 'red;background:blue')).toBe(false);
    expect(isSafeDeclaration('col or', 'red')).toBe(false);
    expect(isSafeSelector('nav[aria-label="Main"] > a')).toBe(true);
    expect(isSafeSelector('a{')).toBe(false);
  });
});

describe('allow-list des propriétés', () => {
  it.each([
    'display',
    'grid-template-columns',
    'background-color',
    'font-size',
    'border-top-left-radius',
    '--accent',
    'inset-inline-start',
  ])('autorise %s', (property) => expect(isSafeDeclaration(property, '1px')).toBe(true));
  it.each(['content', 'all', '-moz-binding', 'behavior'])('refuse %s', (property) =>
    expect(isSafeDeclaration(property, 'x')).toBe(false),
  );
});
