// Résolution de la recette (regionIndex → sélecteurs), normalisation du CSS libre et preview.
import { compileRule } from '../shared/compile';
import { cssViolation, isAllowedProperty } from '../shared/cssSafety';
import type { Draft, DraftChange, Recipe, RecipeChange, Target } from '../shared/types';
import { regionAt } from './distill';
import { detectLayoutRegressions } from './layoutCheck';
import { buildSelectors, fingerprint, groupSelector } from './selectors';

const PREVIEW_ID = 'bp-preview';

/**
 * Parse le CSS libre via le CSSOM du navigateur : seules les règles de style (et leurs
 * conteneurs @media/@supports/@container) survivent ; chaque déclaration passe en !important ;
 * les propriétés hors allow-list sont retirées.
 */
export function normalizeFreeCss(css: string, warnings: string[]): string {
  const source = css.trim();
  if (!source) return '';
  const violation = cssViolation(source);
  if (violation) throw new Error(`Le CSS proposé par l’IA a été refusé : ${violation}`);
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(source);
  const dropped = new Set<string>();

  const clean = (rules: CSSRuleList): string[] => {
    const out: string[] = [];
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        for (const property of [...rule.style]) {
          if (!isAllowedProperty(property)) {
            dropped.add(property);
            rule.style.removeProperty(property);
          } else {
            rule.style.setProperty(property, rule.style.getPropertyValue(property), 'important');
          }
        }
        if (rule.style.length) out.push(rule.cssText);
      } else if (
        rule instanceof CSSMediaRule ||
        rule instanceof CSSSupportsRule ||
        rule instanceof CSSContainerRule
      ) {
        const inner = clean(rule.cssRules);
        if (inner.length)
          out.push(
            `@${rule.cssText.slice(1, rule.cssText.indexOf('{')).trim()}{${inner.join('\n')}}`,
          );
      } else if (rule instanceof CSSKeyframesRule) {
        out.push(rule.cssText);
      } else {
        dropped.add(rule.cssText.slice(0, 20));
      }
    }
    return out;
  };

  const result = clean(sheet.cssRules).join('\n');
  if (dropped.size) warnings.push(`Éléments CSS ignorés : ${[...dropped].slice(0, 5).join(', ')}.`);
  // Revérification après sérialisation par le navigateur.
  const after = cssViolation(result);
  if (after) throw new Error(`Le CSS proposé par l’IA a été refusé : ${after}`);
  return result;
}

/** Transforme chaque cible de la recette en sélecteurs robustes + empreinte. */
export function resolveTargets(
  change: Pick<RecipeChange, 'targets'>,
  warnings: string[],
): Record<string, Target> {
  const targets: Record<string, Target> = {};
  for (const [key, ref] of Object.entries(change.targets)) {
    const element = regionAt(ref.regionIndex);
    if (element) {
      // Toute une liste répétée : un sélecteur de groupe d'abord, puis l'exemplaire en repli.
      const group = ref.scope === 'all_similar' ? groupSelector(element) : null;
      if (ref.scope === 'all_similar' && !group) {
        warnings.push(
          `Cible ${key} : impossible de viser tous les éléments similaires, seul le premier sera modifié.`,
        );
      }
      const selectors = group ? [group] : buildSelectors(element, ref.selectorHints);
      if (selectors.length) {
        targets[key] = { selectors, fingerprint: fingerprint(element), minMatches: 1 };
        continue;
      }
    }
    // Pas d'index exploitable : on se rabat sur les suggestions du LLM qui matchent vraiment.
    const hints = ref.selectorHints.filter((hint) => {
      try {
        return document.querySelectorAll(hint).length > 0;
      } catch {
        return false;
      }
    });
    if (hints.length) {
      const first = document.querySelector(hints[0]!)!;
      targets[key] = {
        selectors: hints.slice(0, 3),
        fingerprint: fingerprint(first),
        minMatches: 1,
      };
    } else {
      warnings.push(`Cible ${key} introuvable sur la page : ignorée.`);
    }
  }
  return targets;
}

function previewElement(): HTMLStyleElement {
  let style = document.getElementById(PREVIEW_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = PREVIEW_ID;
  }
  // Toujours après bp-styles pour que la preview l'emporte.
  document.documentElement.appendChild(style);
  return style;
}

export function setPreview(css: string): void {
  const style = previewElement();
  style.textContent = css;
  style.disabled = original;
}

export function clearPreview(): void {
  document.getElementById(PREVIEW_ID)?.remove();
}

/** CSS de preview : seulement les changements cochés (recompilé, donc refiltré). */
export function compileChanges(
  changes: Pick<DraftChange, 'ops' | 'targets' | 'css' | 'enabled'>[],
) {
  return changes
    .filter((c) => c.enabled)
    .map((c) => compileRule(c))
    .filter((css) => css.trim())
    .join('\n');
}

/** Résout un changement de la recette ; null s'il ne produit rien sur cette page. */
function resolveChange(change: RecipeChange, warnings: string[]): DraftChange | null {
  const local: string[] = [];
  const targets = resolveTargets(change, local);
  const ops = change.ops.filter((op) => !op.target || op.target in targets);
  const css = normalizeFreeCss(change.css, local);
  warnings.push(...local.map((w) => `${change.title} : ${w}`));
  const resolved: DraftChange = { title: change.title, ops, targets, css, enabled: true };
  if (!compileRule(resolved).trim()) {
    warnings.push(`« ${change.title} » ne produit aucun changement visible : ignoré.`);
    return null;
  }
  return resolved;
}

/** Construit le brouillon complet et l'applique en preview. */
export function prepareDraft(recipe: Recipe, prompts: string[]): Draft {
  const warnings: string[] = [];
  const changes = recipe.changes
    .map((change) => resolveChange(change, warnings))
    .filter((c): c is DraftChange => !!c);
  const previewCss = compileChanges(changes);
  if (!previewCss.trim() && !warnings.length) {
    warnings.push('Cette modification ne produit aucun changement visible.');
  }
  // Mesure avant/après la nouvelle preview (synchrone : rien n'est peint entre les deux).
  const hidden = changes.flatMap((change) =>
    Object.entries(change.targets)
      .filter(([key]) => change.ops.some((op) => op.op === 'hide' && op.target === key))
      .flatMap(([, t]) => t.selectors),
  );
  const layoutIssues = detectLayoutRegressions(
    () => setPreview(previewCss),
    () => setPreview(''),
    (element) =>
      hidden.some((selector) => {
        try {
          return !!element.closest(selector);
        } catch {
          return false;
        }
      }) || getComputedStyle(element).display === 'none',
  );
  return {
    host: location.hostname,
    prompts,
    recipe,
    changes,
    explanation: recipe.explanation,
    previewCss,
    warnings,
    layoutIssues,
  };
}

/**
 * Exécute `fn` avec les styles Browser Paint désactivés (rien n'est peint entre-temps :
 * tout est synchrone), pour que la distillation voie la page d'origine.
 */
export function withoutOurStyles<T>(fn: () => T): T {
  const styles = ['bp-styles', 'bp-preview']
    .map((id) => document.getElementById(id) as HTMLStyleElement | null)
    .filter((s): s is HTMLStyleElement => !!s);
  const previous = styles.map((s) => s.disabled);
  styles.forEach((s) => (s.disabled = true));
  try {
    return fn();
  } finally {
    styles.forEach((s, i) => (s.disabled = previous[i]!));
  }
}

/** Mode « Original » : désactive temporairement tous les styles Browser Paint de l'onglet. */
let original = false;
const ORIGINAL_STYLE_IDS = ['bp-styles', 'bp-preview'];

export function setOriginal(on: boolean): boolean {
  original = on;
  for (const id of ORIGINAL_STYLE_IDS) {
    const style = document.getElementById(id) as HTMLStyleElement | null;
    if (style) style.disabled = on;
  }
  document.documentElement.toggleAttribute('data-bp-original', on);
  return original;
}

export function isOriginal(): boolean {
  return original;
}
