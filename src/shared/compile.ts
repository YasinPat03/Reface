// Compilateur recette → CSS (PRD §3, §4). Pur, sans DOM : tourne aussi dans le service worker.
import { isSafeDeclaration, isSafeSelector, cssViolation } from './cssSafety';
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

/** CSS précompilé du site : uniquement les règles activées. */
export function compileSite(rules: Rule[]): string {
  return rules
    .filter((rule) => rule.enabled)
    .map((rule) => `/* ${rule.id.replace(/[^\w-]/g, '')} */\n${compileRule(rule)}`)
    .join('\n');
}
