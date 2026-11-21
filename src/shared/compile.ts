// Compilateur recette → CSS (PRD §3, §4). Pur, sans DOM : tourne aussi dans le service worker.
import { isSafeDeclaration, isSafeSelector, cssViolation } from './cssSafety.ts';
import { SITE_WIDE, type CompiledCss } from './section.ts';
import type { CssDeclarations, Op, Rule, Target } from './types';

/** `!important` sur chaque déclaration pour battre la spécificité du site. */
function declarations(css: CssDeclarations | undefined): string {
  if (!css) return '';
  return Object.entries(css)
    .map(
      ([property, raw]) =>
        [property.trim().toLowerCase(), raw.replace(/\s*!important\s*$/i, '').trim()] as const,
    )
    .filter(([property, value]) => value && isSafeDeclaration(property, value))
    .map(([property, value]) => `${property}:${value}!important`)
    .join(';');
}

function selectorList(target: Target | undefined): string {
  return (target?.selectors ?? []).filter(isSafeSelector).join(',');
}

function compileOp(op: Op, targets: Record<string, Target>): string {
  switch (op.op) {
    case 'hide': {
      const selectors = selectorList(op.target ? targets[op.target] : undefined);
      return selectors ? `${selectors}{display:none!important}` : '';
    }
    case 'style': {
      const selectors = selectorList(op.target ? targets[op.target] : undefined);
      const body = declarations(op.css);
      return selectors && body ? `${selectors}{${body}}` : '';
    }
    case 'theme': {
      // Le thème vise la page entière, ou une cible si fournie.
      const selectors = op.target ? selectorList(targets[op.target]) : 'html,body';
      const body = declarations(op.css);
      return selectors && body ? `${selectors}{${body}}` : '';
    }
  }
}

/** CSS d'une règle. Le CSS libre est déjà normalisé à l'enregistrement ; on le revérifie. */
export function compileRule(rule: Pick<Rule, 'ops' | 'targets' | 'css'>): string {
  const parts = rule.ops.map((op) => compileOp(op, rule.targets)).filter(Boolean);
  const free = rule.css.trim();
  if (free && cssViolation(free) === null) parts.push(free);
  return parts.join('\n');
}

/** CSS précompilé du site, par section : seules les règles activées. */
export function compileSite(rules: Rule[]): CompiledCss {
  const out: CompiledCss = {};
  for (const rule of rules) {
    if (!rule.enabled || rule.scope === 'page') continue;
    const css = compileRule(rule);
    if (!css) continue;
    const key = rule.section || SITE_WIDE;
    out[key] = `${out[key] ? `${out[key]}\n` : ''}/* ${rule.id.replace(/[^\w-]/g, '')} */\n${css}`;
  }
  return out;
}

/** Page themes are keyed by origin and pathname, including SPA route changes. */
export function compilePages(rules: Rule[]): Record<string, string> {
  const grouped = new Map<string, Rule[]>();
  for (const rule of rules) {
    if (!rule.enabled || rule.scope !== 'page' || !rule.pagePath) continue;
    try {
      const url = new URL(rule.urlPattern);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      const key = url.origin + rule.pagePath;
      grouped.set(key, [...(grouped.get(key) ?? []), rule]);
    } catch {
      /* Invalid page URLs never fall through to global CSS. */
    }
  }
  return Object.fromEntries(
    [...grouped].map(([key, scoped]) => [
      key,
      scoped
        .map((rule) => `/* ${rule.id.replace(/[^\w-]/g, '')} */\n${compileRule(rule)}`)
        .join('\n'),
    ]),
  );
}
