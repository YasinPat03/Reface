// Résolution de la recette (regionIndex → sélecteurs), normalisation du CSS libre et preview.
import { compileRule } from '../shared/compile';
import { cssViolation, isAllowedProperty, isSafeSelector } from '../shared/cssSafety';
import type { Draft, DraftChange, Recipe, RecipeChange, Target } from '../shared/types';
import { regionAt } from './distill';
import { compileTheme } from '../shared/theme';
import { roleMap } from './design';
import { detectLayoutRegressions } from './layoutCheck';
import {
  contrastFixes,
  deadSelectors,
  hasVisibleEffect,
  integrityBefore,
  integrityProblems,
  introducedLowContrast,
  lowContrastBefore,
  pageLuminance,
  surfaceFixes,
  visibleTextLength,
  type Fix,
} from './qualityCheck';
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
  if (violation) throw new Error(`The CSS proposed by the AI was rejected: ${violation}`);
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
  if (dropped.size) warnings.push(`Ignored CSS items: ${[...dropped].slice(0, 5).join(', ')}.`);
  // Revérification après sérialisation par le navigateur.
  const after = cssViolation(result);
  if (after) throw new Error(`The CSS proposed by the AI was rejected: ${after}`);
  return result;
}

/** Transforme chaque cible de la recette en sélecteurs robustes + empreinte. */
export function resolveTargets(
  change: Pick<RecipeChange, 'targets' | 'ops'>,
  warnings: string[],
): Record<string, Target> {
  const targets: Record<string, Target> = {};
  // Une cible qu'aucune opération n'utilise ne produit rien : ni résolution, ni avertissement.
  const used = new Set(change.ops.map((op) => op.target).filter(Boolean));
  const count = (selector: string) => {
    try {
      return isSafeSelector(selector) ? document.querySelectorAll(selector).length : 0;
    } catch {
      return 0;
    }
  };
  for (const [key, ref] of Object.entries(change.targets)) {
    if (!used.has(key)) continue;
    const element = regionAt(ref.regionIndex);
    if (element) {
      // Toute une liste répétée : un sélecteur de groupe d'abord, puis les suggestions du LLM qui
      // visent plusieurs éléments (la région est souvent le conteneur de la liste), puis l'exemplaire.
      const group =
        ref.scope === 'all_similar'
          ? (groupSelector(element) ?? ref.selectorHints.find((hint) => count(hint) >= 2) ?? null)
          : null;
      if (ref.scope === 'all_similar' && !group) {
        warnings.push(
          `Target ${key}: can’t target all similar elements, only the first one will be changed.`,
        );
      }
      const selectors = group ? [group] : buildSelectors(element, ref.selectorHints);
      if (selectors.length) {
        targets[key] = { selectors, fingerprint: fingerprint(element), minMatches: 1 };
        continue;
      }
    }
    // Pas d'index exploitable : on se rabat sur les suggestions du LLM qui matchent vraiment.
    const hints = ref.selectorHints.filter((hint) => count(hint) > 0);
    if (hints.length) {
      const first = document.querySelector(hints[0]!)!;
      targets[key] = {
        selectors: hints.slice(0, 3),
        fingerprint: fingerprint(first),
        minMatches: 1,
      };
    } else {
      warnings.push(`Target ${key} not found on the page: ignored.`);
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
  // Thème : les jetons du LLM sont appliqués aux rôles de la page d'origine (sans nos styles).
  const themeCss = change.theme
    ? normalizeFreeCss(
        compileTheme(
          change.theme,
          withoutOurStyles(() => roleMap()),
        ),
        local,
      )
    : '';
  warnings.push(...local.map((w) => `${change.title}: ${w}`));
  const resolved: DraftChange = {
    title: change.title,
    ops,
    targets,
    css,
    enabled: true,
    ...(change.theme ? { theme: change.theme, themeCss } : {}),
  };
  if (!compileRule(resolved).trim()) {
    warnings.push(`"${change.title}" produces no visible change: ignored.`);
    return null;
  }
  return resolved;
}

/** Exécute `fn` sans les règles enregistrées du site (bp-styles), la preview restant active. */
function withoutSavedStyles<T>(fn: () => T): T {
  const saved = document.getElementById('bp-styles') as HTMLStyleElement | null;
  const previous = saved?.disabled ?? false;
  if (saved) saved.disabled = true;
  try {
    return fn();
  } finally {
    if (saved) saved.disabled = previous;
  }
}

/** Un changement qui cache quelque chose (op hide ou display:none dans son CSS). */
function hidesSomething(change: DraftChange): boolean {
  return change.ops.some((op) => op.op === 'hide') || /display\s*:\s*none/i.test(change.css);
}

/** Ajoute des corrections calculées au CSS de leur changement (normalisées comme le CSS libre). */
function applyFixes(changes: DraftChange[], fixes: Fix[]): void {
  for (const fix of fixes) {
    const change = changes[fix.change];
    if (!change) continue;
    try {
      const css = normalizeFreeCss(fix.css, []);
      if (css) change.css = [change.css, css].filter((s) => s.trim()).join('\n');
    } catch {
      /* correction refusée par la validation CSS : ignorée */
    }
  }
}

/**
 * Garde-fous de qualité (`qualityCheck.ts`). Modifie `changes` en place :
 * - désactive un changement qui masque la majeure partie de la page ;
 * - signale les changements dont la plupart des règles ne visent rien (demande ignorée) ;
 * - repeint les surfaces restées claires d'un thème sombre et corrige le contraste dégradé.
 * Retourne les problèmes à renvoyer au LLM (en anglais) pour une auto-correction.
 */
function enforceQuality(
  changes: DraftChange[],
  warnings: string[],
): { issues: string[]; broken: string[] } {
  const issues: string[] = [];
  setPreview('');
  const list = withoutOurStyles(() => roleMap()).list;
  const integrity = integrityBefore(list);
  const textBefore = Math.max(1, visibleTextLength());
  const lowBefore = lowContrastBefore();
  const luminanceBefore = pageLuminance();

  for (const change of changes) {
    if (!hidesSomething(change)) continue;
    setPreview(compileRule(change));
    const lost = 1 - visibleTextLength() / textBefore;
    if (lost > 0.5) {
      change.enabled = false;
      warnings.push(`"${change.title}" hid ${Math.round(lost * 100)}% of the page text: disabled.`);
      issues.push(
        `The change "${change.title}" hid ${Math.round(lost * 100)}% of the page text: it targets a container that also holds the main content. Target only the smallest element that contains what the user wants hidden (see the layout roles in the design snapshot).`,
      );
    }
  }

  for (const change of changes) {
    if (!change.enabled) continue;
    // Le thème compilé vise des rôles vérifiés : seul le CSS écrit par le LLM peut viser à côté.
    const css = compileRule({ ...change, themeCss: undefined });
    const total = css.split('{').length - 1;
    const dead = deadSelectors(css);
    if (total && dead.length * 2 >= total) {
      warnings.push(
        `"${change.title}": ${dead.length} of ${total} rule(s) target no element on the page.`,
      );
      issues.push(
        `In the change "${change.title}", these selectors match nothing on this page: ${dead.slice(0, 4).join(' ; ')}. Use the verified selectors from the design snapshot instead.`,
      );
    }
  }

  for (const change of changes) {
    if (!change.enabled) continue;
    const css = compileRule(change);
    const effect = () =>
      hasVisibleEffect(
        css,
        () => setPreview(css),
        () => setPreview(''),
      );
    if (effect()) continue;
    // Sans effet parce qu'une règle déjà enregistrée fait la même chose : on prévient seulement.
    if (withoutSavedStyles(effect)) {
      warnings.push(`"${change.title}" is already applied by a saved change.`);
      continue;
    }
    warnings.push(`"${change.title}" changes nothing visible on the page.`);
    issues.push(
      `The change "${change.title}" has NO visible effect: its selectors match, but the computed styles do not change (the elements probably set their own value, e.g. a heading with its own color inside the styled container). Apply the declarations to the elements that actually display the text or surface (e.g. the h1 itself, or "container *").`,
    );
  }

  const compiled = () => changes.map((change) => (change.enabled ? compileRule(change) : ''));
  setPreview(compileChanges(changes));
  applyFixes(changes, surfaceFixes(luminanceBefore, compiled()));
  setPreview(compileChanges(changes));
  // Une à une : chaque correction n'est gardée que si elle réduit les textes illisibles.
  let lowCount = introducedLowContrast(lowBefore);
  for (const fix of lowCount ? contrastFixes(lowBefore, compiled()) : []) {
    const change = changes[fix.change];
    if (!change) continue;
    const previous = change.css;
    applyFixes(changes, [fix]);
    setPreview(compileChanges(changes));
    const now = introducedLowContrast(lowBefore);
    if (now < lowCount) lowCount = now;
    else change.css = previous;
    if (!lowCount) break;
  }
  // Intégrité de la mise en page, sur le résultat final (corrections comprises).
  setPreview(compileChanges(changes));
  const integrityCheck = integrityProblems(list, integrity);
  issues.push(...integrityCheck.issues);
  setPreview('');
  return { issues, broken: integrityCheck.user };
}

/** Construit le brouillon complet et l'applique en preview. */
export function prepareDraft(recipe: Recipe, prompts: string[]): Draft {
  const warnings: string[] = [];
  const changes = recipe.changes
    .map((change) => resolveChange(change, warnings))
    .filter((c): c is DraftChange => !!c);
  const { issues: qualityIssues, broken } = enforceQuality(changes, warnings);
  const previewCss = compileChanges(changes);
  if (!previewCss.trim() && !warnings.length) {
    warnings.push('This change produces no visible change.');
  }
  // Mesure avant/après la nouvelle preview (synchrone : rien n'est peint entre les deux).
  const hidden = changes.flatMap((change) =>
    Object.entries(change.targets)
      .filter(([key]) => change.ops.some((op) => op.op === 'hide' && op.target === key))
      .flatMap(([, t]) => t.selectors),
  );
  const regressions = detectLayoutRegressions(
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
  const layoutIssues = [...qualityIssues, ...regressions];
  return {
    host: location.hostname,
    prompts,
    recipe,
    changes,
    explanation: recipe.explanation,
    previewCss,
    warnings,
    layoutIssues,
    broken,
  };
}

/**
 * Exécute `fn` avec les styles ReFace désactivés (rien n'est peint entre-temps :
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

/** Mode « Original » : désactive temporairement tous les styles ReFace de l'onglet. */
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
