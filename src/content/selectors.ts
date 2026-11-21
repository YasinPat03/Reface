// Génération de sélecteurs robustes (PRD §4, « échelle de sélecteurs ») et empreintes.
// C'est l'extension, pas le LLM, qui choisit les sélecteurs.
import { isSafeSelector } from '../shared/cssSafety';
import type { Fingerprint } from '../shared/types';
import { textSample } from './distill';

/** Classes générées (CSS-in-JS, hash) : instables d'un déploiement à l'autre. */
function isStableToken(token: string): boolean {
  if (!token || token.length > 40) return false;
  if (/^(?:css|sc|jss|emotion|styled|svelte|chakra|mui)-/i.test(token)) return false;
  if (/\d{3,}/.test(token)) return false;
  if (/[A-Za-z0-9]*[A-Z][A-Za-z0-9]*\d|[a-z]\d[a-z]\d/.test(token) && token.length >= 6)
    return false;
  if (/(?:^|[_-])[a-zA-Z0-9]{5,}$/.test(token) && /[0-9]/.test(token)) return false;
  return /^[a-zA-Z_][\w-]*$/.test(token);
}

export function stableClasses(element: Element): string[] {
  return [...element.classList].filter(isStableToken);
}

function attr(name: string, value: string): string | null {
  if (/["\\\n]/.test(value) || value.length > 80) return null;
  return `[${name}="${value}"]`;
}

function matchesOnly(selector: string, element: Element): boolean {
  try {
    const found = document.querySelectorAll(selector);
    return found.length === 1 && found[0] === element;
  } catch {
    return false;
  }
}

/** Sélecteur « local » le plus stable pour un élément, sans tenir compte de l'unicité. */
function localCandidates(element: Element): string[] {
  const tag = element.tagName.toLowerCase();
  const out: string[] = [];
  const id = element.id;
  if (id && isStableToken(id)) out.push(`#${id}`);
  else if (id) {
    const a = attr('id', id);
    if (a && !/\d{4,}/.test(id)) out.push(`${tag}${a}`);
  }
  for (const name of ['data-testid', 'data-test', 'aria-label', 'role']) {
    const value = element.getAttribute(name);
    if (!value) continue;
    const a = attr(name, value);
    if (a) out.push(`${tag}${a}`);
  }
  if (tag.includes('-')) out.push(tag);
  const classes = stableClasses(element).slice(0, 3);
  if (classes.length) out.push(`${tag}.${classes.join('.')}`);
  return out;
}

function nthOfType(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const parent = element.parentElement;
  if (!parent) return tag;
  const same = [...parent.children].filter((c) => c.tagName === element.tagName);
  return same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(element) + 1})` : tag;
}

/** Court chemin depuis l'ancêtre stable le plus proche (au plus 4 niveaux). */
function pathSelector(element: Element): string | null {
  const steps: string[] = [];
  for (let e: Element | null = element; e && steps.length < 5; e = e.parentElement) {
    if (e === document.body || e === document.documentElement) {
      steps.unshift('body');
      break;
    }
    const anchor = e !== element ? localCandidates(e).find((c) => matchesOnly(c, e!)) : undefined;
    if (anchor) {
      steps.unshift(anchor);
      break;
    }
    steps.unshift(nthOfType(e));
  }
  const selector = steps.join(' > ');
  return matchesOnly(selector, element) ? selector : null;
}

/** 2 à 3 sélecteurs uniques, du plus au moins stable. */
export function buildSelectors(element: Element, hints: string[] = []): string[] {
  const out: string[] = [];
  const push = (s: string | null) => {
    if (s && !out.includes(s) && isSafeSelector(s) && matchesOnly(s, element)) out.push(s);
  };
  localCandidates(element).forEach(push);
  hints.forEach(push);
  if (out.length < 2) push(pathSelector(element));
  return out.slice(0, 3);
}

export function fingerprint(element: Element): Fingerprint {
  return {
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    classes: stableClasses(element).slice(0, 6),
    role: element.getAttribute('role'),
    ariaLabel: element.getAttribute('aria-label'),
    textSample: textSample(element, 40),
    childCount: element.childElementCount,
  };
}
