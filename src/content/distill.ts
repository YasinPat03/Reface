// Distillation du DOM (PRD §5) : une ligne par grande région, ~2k tokens max.
// Jamais de valeurs de formulaire ; emails et longues suites de chiffres expurgés.
import type { DistillResult } from '../shared/types';
import { stableClasses } from './selectors';

const MAX_REGIONS = 150;
/** Budget de caractères pour les lignes de régions (~2,5k tokens). */
const CHAR_BUDGET = 10_000;
const SKIP = new Set([
  'SCRIPT',
  'STYLE',
  'SVG',
  'NOSCRIPT',
  'TEMPLATE',
  'LINK',
  'META',
  'HEAD',
  'BR',
  'HR',
  'svg',
]);
const FORM_TEXT = new Set(['TEXTAREA', 'SELECT', 'INPUT', 'OPTION', 'SCRIPT', 'STYLE', 'NOSCRIPT']);
const LANDMARKS = new Set([
  'HEADER',
  'NAV',
  'MAIN',
  'ASIDE',
  'FOOTER',
  'ARTICLE',
  'SECTION',
  'FORM',
  'DIALOG',
]);

/** Éléments de la dernière distillation : regionIndex → Element. */
let regions: Element[] = [];

export function regionAt(index: number): Element | undefined {
  return index >= 0 ? regions[index] : undefined;
}

export function redact(text: string): string {
  return text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/\d[\d\s-]{3,}\d/g, '#');
}

/** Texte visible court, sans le contenu des champs de formulaire. */
export function textSample(element: Element, max = 60): string {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      for (let p = node.parentElement; p && p !== element.parentElement; p = p.parentElement) {
        if (FORM_TEXT.has(p.tagName)) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let text = '';
  for (let node = walker.nextNode(); node && text.length < max * 2; node = walker.nextNode()) {
    const chunk = node.nodeValue?.replace(/\s+/g, ' ').trim();
    if (chunk) text += (text ? ' · ' : '') + chunk;
  }
  return redact(text).slice(0, max);
}

function isVisible(element: Element, rect: DOMRect): boolean {
  if (rect.width < 2 || rect.height < 2) return false;
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  }
  return true;
}

function quote(value: string, max = 40): string {
  return JSON.stringify(redact(value).slice(0, max));
}

function describe(element: Element, index: number, rect: DOMRect, depth: number): string {
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  const tag = element.tagName.toLowerCase();
  const attrs: string[] = [];
  if (element.id) attrs.push(`id=${quote(element.id)}`);
  const role = element.getAttribute('role');
  if (role) attrs.push(`role=${role}`);
  const aria = element.getAttribute('aria-label');
  if (aria) attrs.push(`aria-label=${quote(aria, 30)}`);
  const testId = element.getAttribute('data-testid');
  if (testId) attrs.push(`data-testid=${quote(testId)}`);
  const classes = stableClasses(element).slice(0, 2);
  if (classes.length) attrs.push(`class=${quote(classes.join(' '), 45)}`);
  const r = (n: number) => Math.round(n * 100) / 100;
  attrs.push(
    `rect=(${r(rect.left / vw)},${r((rect.top + window.scrollY) / vh)},${r(rect.width / vw)},${r(rect.height / vh)})`,
  );
  attrs.push(`kids=${element.childElementCount}`);
  const text = textSample(element, 40);
  if (text) attrs.push(`text=${JSON.stringify(text)}`);
  return `${'  '.repeat(Math.min(depth, 6))}[#${index}] <${tag} ${attrs.join(' ')}>`;
}

interface Candidate {
  element: Element;
  rect: DOMRect;
  score: number;
}

/**
 * Parcourt le DOM et garde les régions utiles : landmarks, rôles ARIA, éléments custom,
 * gros conteneurs. Les éléments de `include` (picker, itération) et leurs ancêtres sont forcés.
 */
export function distill(include: string[] = []): DistillResult {
  const viewportArea = Math.max(window.innerWidth * window.innerHeight, 1);
  const forced = new Set<Element>();
  const includedElements = new Map<string, Element>();
  for (const selector of include) {
    let element: Element | null = null;
    try {
      element = document.querySelector(selector);
    } catch {
      /* sélecteur invalide : ignoré */
    }
    if (!element) continue;
    includedElements.set(selector, element);
    for (let e: Element | null = element; e && e !== document.body; e = e.parentElement)
      forced.add(e);
  }

  const candidates: Candidate[] = [];
  const walker = document.createTreeWalker(
    document.body ?? document.documentElement,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        return SKIP.has((node as Element).tagName)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node as Element;
    if (element.id === 'bp-styles' || element.id === 'bp-preview') continue;
    const rect = element.getBoundingClientRect();
    const isForced = forced.has(element);
    if (!isForced && !isVisible(element, rect)) continue;
    const tag = element.tagName;
    const area = (rect.width * rect.height) / viewportArea;
    let score = 0;
    if (isForced) score += 100;
    if (LANDMARKS.has(tag)) score += 10;
    if (element.hasAttribute('role')) score += 6;
    if (tag.includes('-')) score += 5;
    if (element.id) score += 3;
    if (element.childElementCount >= 3) score += 2;
    if (area > 0.1) score += 4;
    else if (area > 0.03) score += 2;
    if (/^H[1-3]$/.test(tag)) score += 3;
    // Seuil bas : c'est le tri par score + le budget qui décident ensuite.
    const keep = isForced || score >= 4;
    if (keep) candidates.push({ element, rect, score: score + Math.min(area, 1) });
  }

  // Plafond : les meilleures régions d'abord, dans la limite du budget de caractères
  // (les éléments forcés passent toujours), puis on restitue l'ordre du document.
  const kept = new Set<Element>();
  let budget = CHAR_BUDGET;
  for (const c of [...candidates].sort((a, b) => b.score - a.score)) {
    if (kept.size >= MAX_REGIONS || budget < 60) break;
    const cost = describe(c.element, 0, c.rect, 0).length + 8;
    if (cost > budget && !forced.has(c.element)) continue;
    budget -= cost;
    kept.add(c.element);
  }
  const ordered = candidates.filter((c) => kept.has(c.element));
  regions = ordered.map((c) => c.element);

  const lines = ordered.map((c, index) => {
    let depth = 0;
    for (let p = c.element.parentElement; p; p = p.parentElement) if (kept.has(p)) depth++;
    return describe(c.element, index, c.rect, depth);
  });

  const included: Record<string, number> = {};
  for (const selector of include) {
    const element = includedElements.get(selector);
    included[selector] = element ? regions.indexOf(element) : -1;
  }

  return {
    url: location.origin + location.pathname,
    title: document.title.slice(0, 120),
    host: location.hostname,
    regions: lines.join('\n'),
    regionCount: lines.length,
    typography: typography(),
    included,
  };
}

/** Résumé utile pour les demandes de police, taille ou couleur. */
function typography(): string {
  const counts = [
    'h1',
    'h2',
    'h3',
    'p',
    'a',
    'li',
    'pre',
    'code',
    'img',
    'video',
    'table',
    'button',
  ]
    .map((tag) => [tag, document.getElementsByTagName(tag).length] as const)
    .filter(([, n]) => n > 0)
    .map(([tag, n]) => `${tag}:${n}`)
    .join(' ');
  const sample = (selector: string) => {
    const element = document.querySelector(selector);
    if (!element) return '';
    const s = getComputedStyle(element);
    return `${selector}{font:${s.fontSize}/${s.lineHeight} ${s.fontFamily.slice(0, 60)};color:${s.color};background:${s.backgroundColor}}`;
  };
  return [counts, sample('body'), sample('main p, article p, p'), sample('h1')]
    .filter(Boolean)
    .join('\n');
}
