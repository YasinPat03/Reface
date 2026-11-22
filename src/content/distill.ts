// Distillation du DOM (PRD §5) : une ligne par grande région, ~2k tokens max.
// Jamais de valeurs de formulaire ; emails et longues suites de chiffres expurgés.
import type { DistillResult } from '../shared/types';
import { mediaInventory, siteContext } from './context';
import { designSnapshot } from './design';
import { isStableId, repeatSignature, stableClasses } from './selectors';

const MAX_REGIONS = 150;
/** Budget de caractères pour les lignes de régions (~2,5k tokens). */
const CHAR_BUDGET = 10_000;
const MAX_FOCUS_DESCENDANTS = 30;
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
const LANDMARKS = new Set(['HEADER', 'NAV', 'MAIN', 'ASIDE', 'FOOTER', 'DIALOG']);
/** Conteneurs sémantiques fréquents (souvent très nombreux) : bonus plus faible. */
const SECTIONING = new Set(['ARTICLE', 'SECTION', 'FORM', 'TABLE', 'FIGURE']);
/** En dessous de cette fraction de l'écran, un élément non structurant est du bruit (pastilles, icônes). */
const MIN_AREA = 0.004;
/** Éléments frères identiques : on en montre 2, les suivants sont résumés par « similar=×N ». */
const REPEAT_SHOWN = 2;
const REPEAT_MIN = 4;

/** Éléments de la dernière distillation : regionIndex → Element. */
let regions: Element[] = [];

export function regionAt(index: number): Element | undefined {
  return index >= 0 ? regions[index] : undefined;
}

/** Index de région (dernière distillation) de l'élément visé par chaque sélecteur, ou -1. */
export function locate(selectors: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const selector of selectors) {
    let element: Element | null = null;
    try {
      element = document.querySelector(selector);
    } catch {
      /* sélecteur invalide */
    }
    out[selector] = element ? regions.indexOf(element) : -1;
  }
  return out;
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

/** Fond opaque différent de celui du parent (ou attribut HTML bgcolor). */
function ownBackground(element: Element): boolean {
  if (element.hasAttribute('bgcolor')) return true;
  const own = getComputedStyle(element).backgroundColor;
  if (/^rgba\(.*,\s*0\)$|^transparent$/.test(own)) return false;
  return !element.parentElement || getComputedStyle(element.parentElement).backgroundColor !== own;
}

function isVisible(element: Element, rect: DOMRect): boolean {
  if (rect.width < 2 || rect.height < 2) return false;
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  }
  return true;
}

/** Valeur citée ; « … » signale une troncature (le LLM ne doit pas en faire un sélecteur exact). */
function quote(value: string, max = 40): string {
  const clean = redact(value);
  return JSON.stringify(clean.length > max ? `${clean.slice(0, max)}…` : clean);
}

/**
 * Classes stables affichées : entières (une classe coupée, « ytSpecTouchFeedb », donnait des
 * sélecteurs morts), au plus 2 et environ 60 caractères. La 1re passe toujours (≤ 40 caractères).
 */
function shownClasses(element: Element): string {
  const shown: string[] = [];
  for (const name of stableClasses(element).slice(0, 2)) {
    if (shown.length && [...shown, name].join(' ').length > 60) break;
    shown.push(name);
  }
  return shown.join(' ');
}

/** Rang d'un élément parmi ses frères de même signature (balise + classes stables). */
let repeatCache = new WeakMap<Element, { rank: number; total: number }>();
function repeatInfo(element: Element): { rank: number; total: number } {
  const cached = repeatCache.get(element);
  if (cached) return cached;
  const parent = element.parentElement;
  if (!parent) return { rank: 0, total: 1 };
  const groups = new Map<string, Element[]>();
  for (const child of parent.children) {
    // Un id stable distingue des frères structurels (#header, #contents…) : ce ne sont pas des
    // répétitions. Un id généré ou numérique (lignes HN « 50582069 ») n'empêche pas la répétition.
    const id = child.id && isStableId(child.id) ? child.id : '';
    const signature = `${id}#${repeatSignature(child)}`;
    groups.set(signature, [...(groups.get(signature) ?? []), child]);
  }
  for (const members of groups.values()) {
    members.forEach((member, rank) => repeatCache.set(member, { rank, total: members.length }));
  }
  return repeatCache.get(element) ?? { rank: 0, total: 1 };
}

function describe(element: Element, index: number, rect: DOMRect, depth: number): string {
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  const tag = element.tagName.toLowerCase();
  const attrs: string[] = [];
  // Un id généré (« 50582069 », « mwDg8 ») n'aide pas le LLM : seuls les ids stables sont montrés.
  if (element.id && isStableId(element.id)) attrs.push(`id=${quote(element.id)}`);
  const role = element.getAttribute('role');
  if (role) attrs.push(`role=${role}`);
  const aria = element.getAttribute('aria-label');
  if (aria) attrs.push(`aria-label=${quote(aria, 30)}`);
  const testId = element.getAttribute('data-testid');
  if (testId) attrs.push(`data-testid=${quote(testId)}`);
  const classes = shownClasses(element);
  if (classes) attrs.push(`class=${JSON.stringify(classes)}`);
  const r = (n: number) => Math.round(n * 100) / 100;
  attrs.push(
    `rect=(${r(rect.left / vw)},${r((rect.top + window.scrollY) / vh)},${r(rect.width / vw)},${r(rect.height / vh)})`,
  );
  attrs.push(`kids=${element.childElementCount}`);
  const repeat = repeatInfo(element);
  if (repeat.total >= REPEAT_MIN && repeat.rank === 0) attrs.push(`similar=×${repeat.total}`);
  const text = textSample(element, 40);
  if (text) attrs.push(`text=${JSON.stringify(text)}`);
  return `${'  '.repeat(Math.min(depth, 6))}[#${index}] <${tag} ${attrs.join(' ')}>`;
}

/** Même boîte à 2 px près. */
function sameBox(a: DOMRect, b: DOMRect | undefined): boolean {
  return (
    !!b &&
    Math.abs(a.left - b.left) <= 2 &&
    Math.abs(a.top - b.top) <= 2 &&
    Math.abs(a.width - b.width) <= 2 &&
    Math.abs(a.height - b.height) <= 2
  );
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
export function distill(
  include: string[] = [],
  focus: string | string[] | null = null,
): DistillResult {
  const viewportArea = Math.max(window.innerWidth * window.innerHeight, 1);
  repeatCache = new WeakMap(); // le DOM a pu changer depuis la dernière distillation
  const focusSelectors = Array.isArray(focus) ? focus : focus ? [focus] : [];
  include = [...new Set([...include, ...focusSelectors])];
  const forced = new Set<Element>();
  const selected = new Set<Element>();
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

  // Répartit le budget des descendants entre les éléments sélectionnés.
  const perSelection = Math.max(1, Math.floor(MAX_FOCUS_DESCENDANTS / focusSelectors.length));
  for (const selector of focusSelectors) {
    const focused = includedElements.get(selector);
    if (!focused) continue;
    selected.add(focused);
    [...focused.querySelectorAll('*')]
      .filter((e) => !SKIP.has(e.tagName))
      .map((e) => ({ e, rect: e.getBoundingClientRect() }))
      .filter(({ e, rect }) => isVisible(e, rect))
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)
      .slice(0, perSelection)
      .forEach(({ e }) => forced.add(e));
  }

  const candidates: Candidate[] = [];
  // Boîtes déjà vues (un parent est toujours visité avant ses enfants).
  const boxes = new Map<Element, DOMRect>();
  const walker = document.createTreeWalker(
    document.body ?? document.documentElement,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        const element = node as Element;
        if (SKIP.has(element.tagName)) return NodeFilter.FILTER_REJECT;
        // Listes répétitives (cartes vidéo, produits, lignes) : les premiers exemplaires suffisent,
        // le reste (et tout son sous-arbre) est sauté pour garder le budget pour la structure.
        const repeat = repeatInfo(element);
        if (repeat.total >= REPEAT_MIN && repeat.rank >= REPEAT_SHOWN && !forced.has(element)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node as Element;
    if (element.id === 'bp-styles' || element.id === 'bp-preview') continue;
    const rect = element.getBoundingClientRect();
    boxes.set(element, rect);
    const isForced = forced.has(element);
    if (!isForced && !isVisible(element, rect)) continue;
    const tag = element.tagName;
    const area = (rect.width * rect.height) / viewportArea;
    if (!isForced && area < MIN_AREA && !LANDMARKS.has(tag) && !/^H[1-3]$/.test(tag)) continue;
    let score = 0;
    if (isForced) score += 100;
    if (selected.has(element)) score += 200;
    if (LANDMARKS.has(tag)) score += 10;
    else if (SECTIONING.has(tag)) score += 3;
    if (element.hasAttribute('role')) score += 6;
    if (tag.includes('-')) score += 5;
    if (element.id && isStableId(element.id)) score += 3;
    // Enveloppe qui double son parent (même boîte) sans rien qui la désigne : sur YouTube,
    // yt-touch-feedback-shape, yt-light-shape… Elle consommait le budget du plan pour rien.
    else if (
      sameBox(rect, element.parentElement ? boxes.get(element.parentElement) : undefined) &&
      !element.hasAttribute('role') &&
      !element.hasAttribute('aria-label') &&
      !element.hasAttribute('data-testid') &&
      !LANDMARKS.has(tag) &&
      !/^H[1-6]$/.test(tag)
    )
      score -= 4;
    if (element.childElementCount >= 3) score += 2;
    if (area > 0.1) score += 4;
    else if (area > 0.03) score += 2;
    // Loin sous la ligne de flottaison : un peu moins prioritaire.
    if (rect.top + window.scrollY > window.innerHeight * 4) score -= 2;
    // Le titre principal est souvent visé (« le titre en rouge ») : il ne doit jamais être évincé.
    if (tag === 'H1') score += 10;
    else if (/^H[23]$/.test(tag)) score += 3;
    // 1ers exemplaires d'une liste répétée (articles, cartes, lignes) : sans eux, le LLM ne
    // voit que le conteneur et ne peut pas viser les éléments.
    if (repeatInfo(element).total >= REPEAT_MIN) score += 4;
    // Surface au fond propre (barre de navigation, encadré) : c'est ce qu'on repeint.
    if (score < 4 && area > 0.01 && ownBackground(element)) score += 4;
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
    site: siteContext(),
    media: mediaInventory(),
    design: designSnapshot(),
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
