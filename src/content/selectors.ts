// Génération de sélecteurs robustes (PRD §4, « échelle de sélecteurs ») et empreintes.
// C'est l'extension, pas le LLM, qui choisit les sélecteurs.
import { isSafeSelector } from '../shared/cssSafety';
import type { Fingerprint } from '../shared/types';
import { textSample } from './distill';

/** Classes générées (CSS-in-JS, hash) : instables d'un déploiement à l'autre. */
function isStableToken(token: string): boolean {
  if (!token || token.length > 40) return false;
  if (/^(?:css|sc|jss|emotion|styled|svelte|chakra|mui|prc)-/i.test(token)) return false;
  // Hash après un double séparateur : « Root--KH-d », « box__a1B2 ».
  if (/(?:--|__)[A-Za-z0-9-]*[A-Z]/.test(token)) return false;
  if (/\d{3,}/.test(token)) return false;
  // Classes utilitaires (Tailwind, Bootstrap, Primer) : pr-2, mt-4, col-6, d-flex… partagées par
  // des centaines d'éléments, elles ne désignent rien de précis.
  if (/^-?[a-z]{1,4}-(?:\d{1,2}|auto|flex|none|block|inline|grid)$/.test(token)) return false;
  if (/[A-Za-z0-9]*[A-Z][A-Za-z0-9]*\d|[a-z]\d[a-z]\d/.test(token) && token.length >= 6)
    return false;
  if (/(?:^|[_-])[a-zA-Z0-9]{5,}$/.test(token) && /[0-9]/.test(token)) return false;
  // Suffixe de module CSS du type « -pHPop » ou « __nfGOuR » (casse mélangée).
  if (
    /[-_]{1,2}(?=[A-Za-z0-9]{4,8}$)(?=[A-Za-z0-9]*[a-z])(?=[A-Za-z0-9]*[A-Z])[A-Za-z0-9]+$/.test(
      token,
    )
  )
    return false;
  return /^[a-zA-Z_][\w-]*$/.test(token);
}

/** Identifiant lisible (pas un id généré du type « mwDg8 » ou « r1a2b3 »). */
export function isStableId(id: string): boolean {
  return (
    isStableToken(id) &&
    !/^[a-z]{1,3}[A-Z0-9][A-Za-z0-9]{1,6}$/.test(id) &&
    !/\d/.test(id.slice(-2))
  );
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
  if (id && isStableId(id)) out.push(`#${id}`);
  else if (id && !/^[A-Za-z_][\w-]*$/.test(id) && !/\d{3,}/.test(id)) {
    // Id lisible mais non utilisable tel quel en CSS (ex. « main:content ») : sélecteur d'attribut.
    const a = attr('id', id);
    if (a) out.push(`${tag}${a}`);
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

/** Signature « parlante » pour un sélecteur de groupe : balise custom, ou balise + 1re classe stable. */
function groupSignature(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  if (tag.includes('-')) return tag;
  const classes = stableClasses(element).slice(0, 2);
  return classes.length ? `${tag}.${classes.join('.')}` : null;
}

function sameSignatureSiblings(element: Element): number {
  const parent = element.parentElement;
  if (!parent || element.id) return 1;
  const signature = `${element.tagName}.${stableClasses(element).sort().join('.')}`;
  return [...parent.children].filter(
    (c) => !c.id && `${c.tagName}.${stableClasses(c).sort().join('.')}` === signature,
  ).length;
}

/**
 * Sélecteur qui vise l'élément ET ses équivalents dans les autres exemplaires d'une liste
 * répétée (cartes vidéo, produits…) : « ytd-video-renderer ytd-thumbnail ».
 * Retourne null si l'élément n'est pas dans une liste répétée.
 */
export function groupSelector(element: Element): string | null {
  let item: Element | null = null;
  for (
    let e: Element | null = element, hops = 0;
    e && e !== document.body && hops < 8;
    e = e.parentElement, hops++
  ) {
    if (sameSignatureSiblings(e) >= 3 && groupSignature(e)) {
      item = e;
      break;
    }
  }
  if (!item) return null;
  const inner: string[] = [];
  for (let e: Element | null = element; e && e !== item; e = e.parentElement) {
    const signature = groupSignature(e);
    if (signature) inner.unshift(signature);
    if (inner.length >= 2) break;
  }
  if (element !== item && !inner.length) inner.push(element.tagName.toLowerCase());
  // Conteneur de la liste (ancêtre parlant le plus proche) : limite la portée à CETTE liste.
  let container: string | null = null;
  for (
    let e = item.parentElement, hops = 0;
    e && e !== document.body && hops < 4;
    e = e.parentElement, hops++
  ) {
    container = groupSignature(e);
    if (container) break;
  }
  const candidates = [
    [groupSignature(item)!, ...inner].join(' '),
    container ? [container, groupSignature(item)!, ...inner].join(' ') : null,
  ].filter((c): c is string => !!c && isSafeSelector(c));
  for (const selector of candidates.reverse()) {
    try {
      const matches = [...document.querySelectorAll(selector)];
      if (matches.includes(element) && matches.length >= 2) return selector;
    } catch {
      /* sélecteur invalide */
    }
  }
  return null;
}
