// Garde-fous de qualité après la preview, sans appel au LLM :
// - sélecteurs morts (une règle qui ne vise aucun élément = une demande ignorée) ;
// - masquage abusif (« cache le pied de page » qui efface toute la page) ;
// - surfaces oubliées par un thème sombre (zones restées claires) ;
// - contraste dégradé par la modif (texte illisible sur un nouveau fond), corrigé par calcul.
import { isSafeSelector } from '../shared/cssSafety';
import { parseColor as parseThemeColor, readable, splitSelectors } from '../shared/theme';
import { buildSelectors, repeatSignature, stableClasses } from './selectors';

const MAX_TEXTS = 400;
/** Pseudo-classes d'état et pseudo-éléments : ne matchent pas au repos, on les retire pour tester. */
const STATE =
  /::?(?:hover|focus(?:-within|-visible)?|active|visited|link|before|after|placeholder|selection|first-line|first-letter|marker)\b(?:\([^)]*\))?/g;

type Rgb = [number, number, number];

function parseColor(color: string): { rgb: Rgb; alpha: number } | null {
  const parts = color.match(/[\d.]+/g)?.map(Number) ?? [];
  if (parts.length < 3) return null;
  return { rgb: [parts[0]!, parts[1]!, parts[2]!], alpha: parts[3] ?? 1 };
}

export function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** 1er ancêtre (ou l'élément) au fond opaque ; null = fond de page par défaut (blanc). */
function backgroundOwner(element: Element): Element | null {
  for (let e: Element | null = element; e; e = e.parentElement) {
    const c = parseColor(getComputedStyle(e).backgroundColor);
    if (c && c.alpha > 0.5) return e;
  }
  return null;
}

function backgroundOf(element: Element): Rgb {
  const owner = backgroundOwner(element);
  return owner ? parseColor(getComputedStyle(owner).backgroundColor)!.rgb : [255, 255, 255];
}

/** Sélecteur sans pseudo-classes d'état, ou null s'il est invalide. */
function restingSelector(selector: string): string | null {
  const base = selector.replace(STATE, '').trim();
  if (!base) return null;
  try {
    document.querySelector(base);
    return base;
  } catch {
    return null;
  }
}

interface StyleRule {
  selectors: string[];
  properties: string[];
}

function styleRules(css: string): StyleRule[] {
  const out: StyleRule[] = [];
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    const walk = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          out.push({ selectors: splitSelectors(rule.selectorText), properties: [...rule.style] });
        } else if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
          walk(rule.cssRules);
        }
      }
    };
    walk(sheet.cssRules);
  } catch {
    /* CSS illisible : aucune règle */
  }
  return out;
}

/** Sélecteurs d'une règle qui ne visent aucun élément de la page (toute la règle est morte). */
export function deadSelectors(css: string): string[] {
  const dead: string[] = [];
  for (const rule of styleRules(css)) {
    const parts = rule.selectors.map((s) => s.trim());
    const alive = parts.some((part) => {
      const base = restingSelector(part);
      return base !== null && !!document.querySelector(base);
    });
    if (!alive) dead.push(parts.join(', '));
  }
  return dead;
}

/** Propriétés qui rendent une modif visible (au repos, sans survol). */
const VISIBLE_PROPERTIES = [
  'color',
  'background-color',
  'background-image',
  'font-size',
  'font-weight',
  'font-family',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-transform',
  'text-decoration-line',
  'display',
  'visibility',
  'opacity',
  'padding-top',
  'padding-left',
  'margin-top',
  'border-top-width',
  'border-top-color',
  'border-top-left-radius',
  'box-shadow',
  'transform',
  'filter',
];

/** Éléments visés par les règles d'un CSS, et leurs premiers textes descendants. */
function probeElements(css: string): Element[] {
  const out = new Set<Element>();
  for (const rule of styleRules(css)) {
    for (const part of rule.selectors) {
      const base = restingSelector(part);
      if (!base) continue;
      for (const element of [...document.querySelectorAll(base)].slice(0, 20)) {
        out.add(element);
        for (const child of [...element.querySelectorAll('*')].slice(0, 20)) out.add(child);
      }
    }
    if (out.size > 400) break;
  }
  return [...out];
}

function visualKey(element: Element): string {
  const s = getComputedStyle(element);
  const r = element.getBoundingClientRect();
  return `${VISIBLE_PROPERTIES.map((p) => s.getPropertyValue(p)).join('|')}|${Math.round(r.width)}x${Math.round(r.height)}`;
}

/**
 * La modif change-t-elle quelque chose à l'écran ? Sinon la demande est ignorée sans le dire
 * (ex. `color` posé sur un conteneur alors que le titre a sa propre couleur).
 * `apply`/`restore` appliquent et retirent ce seul changement.
 */
export function hasVisibleEffect(css: string, apply: () => void, restore: () => void): boolean {
  restore();
  const elements = probeElements(css);
  if (!elements.length) return true; // rien ne matche : cas des sélecteurs morts, signalé à part
  const before = elements.map(visualKey);
  apply();
  const changed = elements.some((element, i) => visualKey(element) !== before[i]);
  restore();
  return changed;
}

/** Longueur du texte visible : chute brutale = la modif cache le contenu principal. */
export function visibleTextLength(): number {
  return (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().length;
}

/** Éléments portant directement du texte visible, dans les 2 premiers écrans. */
function textElements(): Element[] {
  const out: Element[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  for (let node = walker.nextNode(); node && out.length < MAX_TEXTS; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || seen.has(parent) || !node.nodeValue?.trim()) continue;
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION|SELECT)$/.test(parent.tagName)) continue;
    seen.add(parent);
    const rect = parent.getBoundingClientRect();
    if (rect.top > innerHeight * 2 || rect.bottom < 0 || rect.width < 1 || rect.height < 1)
      continue;
    if (!(parent.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }) ?? true))
      continue;
    out.push(parent);
  }
  return out;
}

function threshold(element: Element): number {
  const s = getComputedStyle(element);
  const size = parseFloat(s.fontSize);
  return size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700) ? 3 : 4.5;
}

function contrastOf(element: Element): number {
  const color = parseColor(getComputedStyle(element).color);
  if (!color || color.alpha < 0.3) return 21;
  return contrast(color.rgb, backgroundOf(element));
}

/** Contraste et fond de chaque texte AVANT la modif (référence pour ne juger que ses effets). */
export type ContrastBefore = Map<Element, { ratio: number; background: string }>;

export function lowContrastBefore(): ContrastBefore {
  return new Map(
    textElements().map((e) => [e, { ratio: contrastOf(e), background: backgroundOf(e).join() }]),
  );
}

/**
 * Régression de contraste due à la modif : le texte est sous le seuil ET il ne l'était pas avant,
 * ou la modif l'a nettement empiré, ou elle a changé son fond (lien bleu par défaut sur une
 * barre repeinte en bleu marine).
 */
function degraded(element: Element, before: ContrastBefore): boolean {
  const now = contrastOf(element);
  const minimum = threshold(element);
  if (now >= minimum) return false;
  const was = before.get(element);
  // La modif a changé le fond du texte : sa lisibilité devient de son ressort.
  return (
    was === undefined ||
    was.ratio >= minimum ||
    now < was.ratio - 0.5 ||
    was.background !== backgroundOf(element).join()
  );
}

/** Nombre de textes rendus peu contrastés par la modif en cours. */
export function introducedLowContrast(before: ContrastBefore): number {
  return textElements().filter((e) => degraded(e, before)).length;
}

/** Luminance du fond de page (html/body). */
export function pageLuminance(): number {
  for (const e of [document.body, document.documentElement]) {
    if (!e) continue;
    const c = parseColor(getComputedStyle(e).backgroundColor);
    if (c && c.alpha > 0.5) return luminance(c.rgb);
  }
  return 1;
}

function pageBackground(): string {
  for (const e of [document.body, document.documentElement]) {
    if (!e) continue;
    const value = getComputedStyle(e).backgroundColor;
    const c = parseColor(value);
    if (c && c.alpha > 0.5) return value;
  }
  return 'rgb(255, 255, 255)';
}

const hex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** L'élément est-il dans un élément de liste répétée (≥ 4 frères de même signature) ? */
function inRepeatedList(element: Element): boolean {
  for (let e: Element | null = element; e && e !== document.body; e = e.parentElement) {
    const parent = e.parentElement;
    if (!parent) break;
    const signature = repeatSignature(e);
    let same = 0;
    for (const sibling of parent.children) if (repeatSignature(sibling) === signature) same++;
    if (same >= 4) return true;
  }
  return false;
}

/**
 * Sélecteur de correction : par classe (il vise tous les éléments de même nature, donc tous
 * les éléments d'une liste à l'identique), jamais par position dans une liste répétée.
 */
function fixSelector(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  const classes = stableClasses(element).slice(0, 2);
  const own = classes.length ? `${tag}.${classes.join('.')}` : tag;
  const owner = backgroundOwner(element);
  const positional = (selector: string | null | undefined) => !selector || /:nth-/.test(selector);
  // Fond propre à un ancêtre (barre, carte) : on limite la correction à ce contexte, s'il se
  // désigne sans position.
  const ownerSelector =
    owner && owner !== document.body && owner !== document.documentElement && owner !== element
      ? (buildSelectors(owner)[0] ?? null)
      : null;
  const scope = positional(ownerSelector) ? null : ownerSelector;
  const unique = buildSelectors(element)[0];
  const candidates = [
    scope ? `${scope} ${own}` : null,
    classes.length ? own : null,
    // Sans classe : la position n'est acceptable que hors d'une liste (barre, pied uniques).
    !inRepeatedList(element) && ownerSelector ? `${ownerSelector} ${own}` : null,
    !inRepeatedList(element) ? unique : null,
  ];
  for (const candidate of candidates) {
    if (!candidate || !isSafeSelector(candidate)) continue;
    try {
      if (element.matches(candidate)) return candidate;
    } catch {
      /* invalide */
    }
  }
  return null;
}

/** Index du changement qui a donné son fond (sinon sa couleur) à l'élément ; -1 si aucun. */
function owningChange(element: Element, changesCss: string[]): number {
  const owner = backgroundOwner(element) ?? document.body;
  const rulesPerChange = changesCss.map(styleRules);
  const matches = (e: Element, rule: StyleRule) =>
    rule.selectors.some((s) => {
      const base = restingSelector(s);
      try {
        return base !== null && e.matches(base);
      } catch {
        return false;
      }
    });
  const find = (e: Element, property: RegExp) =>
    rulesPerChange.findIndex((rules) =>
      rules.some((rule) => rule.properties.some((p) => property.test(p)) && matches(e, rule)),
    );
  const byBackground = [owner, document.body, document.documentElement]
    .filter(Boolean)
    .map((e) => find(e!, /^background/))
    .find((i) => i >= 0);
  if (byBackground !== undefined) return byBackground;
  return find(element, /^color$/);
}

/** Couleurs de texte déjà choisies par la modif : on les réutilise pour rester dans la palette. */
function paletteColors(css: string): Rgb[] {
  const out: Rgb[] = [];
  const probe = document.createElement('i');
  document.documentElement.appendChild(probe);
  for (const match of css.matchAll(/(?:^|[;{\s])color\s*:\s*([^;!}]+)/g)) {
    probe.style.color = '';
    probe.style.color = match[1]!.trim();
    const c = probe.style.color ? parseColor(getComputedStyle(probe).color) : null;
    if (c) out.push(c.rgb);
  }
  probe.remove();
  return out;
}

/**
 * Couleur lisible proche de l'intention : la couleur actuelle du texte, foncée ou éclaircie juste
 * assez (un gris secondaire reste un gris), sinon une couleur de la palette de la modif.
 */
function readableColor(current: Rgb, background: Rgb, minimum: number, palette: Rgb[]): string {
  const adjusted = readable(hex(current), [hex(background)], minimum);
  const fixed = parseThemeColor(adjusted);
  if (fixed && contrast(fixed, background) >= minimum) return adjusted;
  const fromPalette = palette.find((c) => contrast(c, background) >= minimum);
  return fromPalette ? hex(fromPalette) : adjusted;
}

export interface Fix {
  change: number;
  css: string;
  note: string;
}

/**
 * Corrige les textes rendus illisibles PAR la modif : couleur lisible sur leur nouveau fond,
 * prise dans la palette de la modif si possible. Une règle par sélecteur, rattachée au changement
 * qui a posé le fond (pour qu'elle s'active et se désactive avec lui).
 */
export function contrastFixes(before: ContrastBefore, changesCss: string[]): Fix[] {
  const palette = paletteColors(changesCss.join('\n'));
  const fixes = new Map<string, Fix>();
  for (const element of textElements()) {
    if (!degraded(element, before)) continue;
    const selector = fixSelector(element);
    if (!selector || fixes.has(selector)) continue;
    const change = owningChange(element, changesCss);
    if (change < 0) continue;
    const current = parseColor(getComputedStyle(element).color)?.rgb ?? [0, 0, 0];
    const color = readableColor(current, backgroundOf(element), threshold(element), palette);
    fixes.set(selector, {
      change,
      css: `html ${selector}{color:${color}}`,
      note: selector,
    });
  }
  return [...fixes.values()].slice(0, 12);
}

/**
 * Thème sombre : grandes surfaces restées claires (barre, encadré, champ de recherche).
 * Elles prennent le fond de la page, rattachées au changement qui a assombri la page.
 */
export function surfaceFixes(luminanceBefore: number, changesCss: string[]): Fix[] {
  if (luminanceBefore < 0.4 || pageLuminance() > 0.2) return [];
  const background = pageBackground();
  const change = owningChange(document.body, changesCss);
  if (change < 0) return [];
  const area = innerWidth * innerHeight;
  const fixes: Fix[] = [];
  for (const element of document.body.querySelectorAll('*')) {
    if (fixes.length >= 8) break;
    if (/^(IMG|VIDEO|CANVAS|PICTURE|IFRAME|svg|SVG)$/.test(element.tagName)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.top > innerHeight * 2 || rect.width * Math.min(rect.height, innerHeight) < area * 0.01)
      continue;
    const c = parseColor(getComputedStyle(element).backgroundColor);
    if (!c || c.alpha < 0.5 || luminance(c.rgb) < 0.4) continue;
    if (element.querySelector('img, video, canvas') && rect.height < innerHeight * 0.6) continue;
    const selector = buildSelectors(element)[0];
    if (!selector) continue;
    fixes.push({ change, css: `${selector}{background-color:${background}}`, note: selector });
  }
  return fixes;
}
