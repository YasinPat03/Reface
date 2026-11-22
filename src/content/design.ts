// Instantané « design » de la page pour le LLM : surfaces et palette réelles, polices, listes
// répétées (squelette d'un élément + sélecteurs vérifiés de ses parties) et rôles (en-tête, pied).
// Sans lui, le LLM ne voit que les grands conteneurs et devine les sélecteurs de mémoire.
import { isSafeSelector } from '../shared/cssSafety';
import type { RoleMap } from '../shared/theme';
import { textSample } from './distill';
import { buildSelectors, isStableId, repeatSignature, stableClasses } from './selectors';

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg', 'SVG', 'BR', 'HR']);
const MAX_LISTS = 3;
const MAX_PARTS = 8;
const MAX_SURFACES = 8;

function count(selector: string): number {
  try {
    return isSafeSelector(selector) ? document.querySelectorAll(selector).length : 0;
  } catch {
    return 0;
  }
}

function visible(element: Element): boolean {
  return typeof element.checkVisibility === 'function'
    ? element.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    : true;
}

/** rgb(1, 2, 3) → #010203 ; null si transparent. */
function hex(color: string): string | null {
  const parts = color.match(/[\d.]+/g)?.map(Number) ?? [];
  if (parts.length < 3 || (parts[3] ?? 1) < 0.5) return null;
  return `#${parts
    .slice(0, 3)
    .map((v) => Math.round(v).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Signature d'un élément de liste : balise + classes stables (un id généré ne compte pas). */
const signature = repeatSignature;

/** Sélecteur CSS de la signature : « tr.athing », ou null si l'élément n'a pas de classe stable. */
function signatureSelector(element: Element): string | null {
  const classes = stableClasses(element).slice(0, 2);
  const tag = element.tagName.toLowerCase();
  if (tag.includes('-')) return tag;
  return classes.length ? `${tag}.${classes.join('.')}` : null;
}

/** Sélecteur court et unique d'un élément (repli : null). */
function uniqueSelector(element: Element): string | null {
  return buildSelectors(element)[0] ?? null;
}

interface List {
  container: Element;
  items: Element[];
  itemSelector: string;
}

/** Listes répétées : au moins 4 frères de même signature, visibles. Les plus grandes d'abord. */
function findLists(): List[] {
  const lists: List[] = [];
  const seen = new Set<Element>();
  for (const container of document.body?.querySelectorAll('*') ?? []) {
    if (SKIP.has(container.tagName) || container.childElementCount < 4) continue;
    const groups = new Map<string, Element[]>();
    for (const child of container.children) {
      if (child.id && isStableId(child.id)) continue;
      const key = signature(child);
      groups.set(key, [...(groups.get(key) ?? []), child]);
    }
    for (const items of groups.values()) {
      if (items.length < 4 || seen.has(items[0]!) || !visible(items[0]!)) continue;
      // Espaceurs et lignes vides : pas des éléments de liste.
      if (!textSample(items[0]!, 10) && !items[0]!.querySelector('img, video')) continue;
      const own = signatureSelector(items[0]!);
      const parent = uniqueSelector(container);
      const candidates = [
        own,
        own && parent ? `${parent} > ${own}` : null,
        parent ? `${parent} > ${items[0]!.tagName.toLowerCase()}` : null,
      ].filter((s): s is string => !!s && isSafeSelector(s));
      // Le sélecteur doit viser exactement ces éléments (pas d'autres listes ailleurs).
      const itemSelector = candidates.find((s) => count(s) === items.length);
      if (!itemSelector) continue;
      items.forEach((item) => seen.add(item));
      lists.push({ container, items, itemSelector });
    }
  }
  const area = (list: List) =>
    list.items.reduce((sum, e) => {
      const r = e.getBoundingClientRect();
      return sum + r.width * r.height;
    }, 0);
  return lists.sort((a, b) => area(b) - area(a)).slice(0, MAX_LISTS);
}

/**
 * Lignes « compagnes » d'un élément de liste : frères sans signature propre qui le suivent
 * (HN : la ligne de métadonnées sous chaque titre, puis un espaceur).
 */
function companions(list: List): string[] {
  const out: string[] = [];
  const first = list.items[0]!;
  let next = first.nextElementSibling;
  let chain = list.itemSelector;
  for (let i = 0; next && i < 2; i++, next = next.nextElementSibling) {
    if (signature(next) === signature(first)) break;
    // Ligne vide (espaceur) : elle sépare les éléments, elle n'en fait pas partie.
    if (!textSample(next, 10) && !next.querySelector('img, video')) break;
    chain = `${chain} + ${next.tagName.toLowerCase()}`;
    if (count(chain) >= list.items.length - 1) out.push(chain);
    else break;
  }
  return out;
}

/** 1er descendant portant directement du texte (sa couleur est celle qu'on voit). */
function firstText(element: Element): Element | null {
  for (const e of [element, ...element.querySelectorAll('*')]) {
    if ([...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue?.trim())) return e;
  }
  return null;
}

interface Part {
  selector: string;
  element: Element;
  count: number;
  tag: string;
  fontSize: number;
  color: string;
  text: string;
  /** Dans une ligne compagne (métadonnées sous le titre). */
  companion: boolean;
}

/** Parties récurrentes d'un élément : classes stables présentes dans la plupart des éléments. */
function collectParts(list: List, roots: string[]): Part[] {
  const out: Part[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const sample = document.querySelector(root);
    if (!sample) continue;
    for (const element of [sample, ...sample.querySelectorAll('*')]) {
      if (out.length >= MAX_PARTS) break;
      if (element === sample && root === list.itemSelector) continue;
      const own = signatureSelector(element);
      if (!own || seen.has(own)) continue;
      seen.add(own);
      const selector = element === sample ? root : `${root} ${own}`;
      const n = count(selector);
      if (n < Math.max(2, list.items.length * 0.5)) continue;
      const text = textSample(element, 30);
      if (!text && !element.matches('img, video, picture')) continue;
      const s = getComputedStyle(firstText(element) ?? element);
      out.push({
        selector,
        element,
        count: n,
        tag: element.tagName.toLowerCase(),
        fontSize: parseFloat(s.fontSize),
        color: hex(s.color) ?? s.color,
        text,
        companion: root !== list.itemSelector,
      });
    }
  }
  return out;
}

function parts(list: List, roots: string[]): string[] {
  return collectParts(list, roots).map(
    (p) =>
      `  - "${p.selector}" ×${p.count}: ${p.tag} ${p.fontSize}px ${p.color}${p.text ? ` "${p.text}"` : ''}`,
  );
}

function describeLists(lists: List[]): string {
  return lists
    .map((list) => {
      const first = list.items[0]!;
      const rect = first.getBoundingClientRect();
      const rows = companions(list);
      const lines = [
        `- ${list.items.length}× "${list.itemSelector}" (${first.tagName.toLowerCase()}, ~${Math.round(rect.width)}×${Math.round(rect.height)}px) "${textSample(first, 40)}"`,
      ];
      if (rows.length) {
        lines.push(
          `  each item continues on the following sibling(s): ${rows.map((r) => `"${r}"`).join(', ')} — style them together with the item (e.g. one card = item + its sibling rows)`,
        );
      }
      lines.push(...parts(list, [list.itemSelector, ...rows]));
      return lines.join('\n');
    })
    .join('\n');
}

interface Surface {
  selector: string;
  element: Element;
  color: string;
  area: number;
  line: string;
}

/** Surfaces opaques visibles (2 premiers écrans), les plus grandes d'abord. */
function collectSurfaces(): Surface[] {
  const vw = innerWidth || 1;
  const vh = innerHeight || 1;
  const found: Surface[] = [];
  for (const element of document.body?.querySelectorAll('*') ?? []) {
    if (SKIP.has(element.tagName) || /^(?:IMG|VIDEO|CANVAS|PICTURE|INPUT)$/.test(element.tagName))
      continue;
    const rect = element.getBoundingClientRect();
    if (rect.top > vh * 2 || rect.width * Math.min(rect.height, vh) < vw * vh * 0.005) continue;
    const color = hex(getComputedStyle(element).backgroundColor);
    if (!color || !visible(element)) continue;
    // Une surface de même couleur que son parent n'apporte rien.
    const parentColor = element.parentElement
      ? hex(getComputedStyle(element.parentElement).backgroundColor)
      : null;
    if (parentColor === color) continue;
    const selector = uniqueSelector(element);
    if (!selector) continue;
    const attribute = element.getAttribute('bgcolor') ? ' (HTML bgcolor attribute)' : '';
    const r = (n: number) => Math.round(n * 100);
    found.push({
      selector,
      element,
      color,
      area: rect.width * rect.height,
      line: `- "${selector}" background ${color}${attribute}, text ${hex(getComputedStyle(element).color) ?? '?'}, ${r(rect.width / vw)}%×${r(rect.height / vh)}% of viewport at top ${r(rect.top / vh)}%`,
    });
  }
  return found.sort((a, b) => b.area - a.area).slice(0, MAX_SURFACES);
}

/** Surfaces opaques visibles, les plus grandes d'abord, avec leur couleur et l'origine (CSS ou bgcolor). */
function surfaces(): string {
  const page =
    hex(getComputedStyle(document.body).backgroundColor) ??
    hex(getComputedStyle(document.documentElement).backgroundColor) ??
    '#ffffff (default)';
  const lines = collectSurfaces().map((f) => f.line);
  const attributes = count('[bgcolor]');
  return [
    `- page (html, body) background ${page}`,
    ...lines,
    attributes
      ? `- ${attributes} element(s) get their color from an HTML bgcolor attribute: select them with "[bgcolor]" to repaint them`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Couleurs de texte et polices dominantes (par nombre d'éléments portant du texte). */
function palette(): string {
  const colors = new Map<string, number>();
  const links = new Map<string, number>();
  const fonts = new Map<string, number>();
  let scanned = 0;
  for (const element of document.body?.querySelectorAll('*') ?? []) {
    if (scanned > 1500) break;
    if (SKIP.has(element.tagName)) continue;
    if (![...element.childNodes].some((n) => n.nodeType === 3 && n.nodeValue?.trim())) continue;
    scanned++;
    const s = getComputedStyle(element);
    const color = hex(s.color);
    if (!color) continue;
    const map = element.closest('a') ? links : colors;
    map.set(color, (map.get(color) ?? 0) + 1);
    const font = `${s.fontFamily.split(',')[0]?.trim()} ${s.fontSize}`;
    fonts.set(font, (fonts.get(font) ?? 0) + 1);
  }
  const top = (map: Map<string, number>, n: number) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => `${k} ×${v}`)
      .join(', ');
  return [
    `- text colors: ${top(colors, 4) || 'none'}`,
    `- link colors: ${top(links, 3) || 'none'}`,
    `- fonts: ${top(fonts, 4) || 'none'}`,
  ].join('\n');
}

/**
 * En-tête et pied de page : balises sémantiques d'abord, sinon le bloc large avec au moins
 * 3 liens le plus haut (en-tête) ou le plus bas (pied).
 */
function pickRole(semantic: string, fromTop: boolean): Element | null {
  const vw = innerWidth || 1;
  {
    const tagged = [...document.querySelectorAll(semantic)].find(visible);
    if (tagged) return tagged;
    const blocks = [
      ...(document.body?.querySelectorAll('div, td, table, nav, section, center') ?? []),
    ]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.width > vw * 0.4 &&
          r.height > 8 &&
          r.height < 220 &&
          e.querySelectorAll('a').length >= 3 &&
          visible(e)
        );
      })
      .map((e) => ({ e, top: e.getBoundingClientRect().top + scrollY }));
    if (!blocks.length) return null;
    blocks.sort((a, b) => (fromTop ? a.top - b.top : b.top - a.top));
    // Le plus petit bloc à cette hauteur (pas son ancêtre géant).
    const edge = blocks[0]!.top;
    return (
      blocks
        .filter((b) => Math.abs(b.top - edge) < 4)
        .map((b) => b.e)
        .sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)
        .find((e) => uniqueSelector(e)) ?? null
    );
  }
}

const ROLES = [
  ['header/top bar', 'header, [role="banner"]', true],
  ['footer', 'footer, [role="contentinfo"]', false],
] as const;

function roles(): string {
  const out: string[] = [];
  for (const [name, semantic, fromTop] of ROLES) {
    const element = pickRole(semantic, fromTop);
    const selector = element && uniqueSelector(element);
    if (!element || !selector) continue;
    const s = getComputedStyle(element);
    out.push(
      `- ${name}: "${selector}" background ${hex(s.backgroundColor) ?? 'transparent'} "${textSample(element, 40)}"`,
    );
  }
  return out.join('\n');
}

/** Instantané complet, dans la limite d'environ 1 200 tokens. */
export function designSnapshot(): string {
  const lists = findLists();
  const sections = [
    `Surfaces:\n${surfaces()}`,
    `Palette:\n${palette()}`,
    lists.length
      ? `Repeated lists (verified selectors, use them in "css"):\n${describeLists(lists)}`
      : '',
    `Layout roles:\n${roles()}`,
  ].filter((s) => s.trim() && !s.endsWith(':\n'));
  return sections.join('\n\n').slice(0, 5000);
}

/** Ligne vide qui suit un élément et ses compagnes (espaceur entre deux éléments). */
function spacerAfter(list: List, last: string): string | null {
  let probe: Element | null = document.querySelector(last);
  const next = probe?.nextElementSibling ?? null;
  if (!next || textSample(next, 10) || next.querySelector('img, video')) return null;
  probe = next;
  const selector = `${last} + ${probe.tagName.toLowerCase()}`;
  return count(selector) >= list.items.length - 1 ? selector : null;
}

/** Lien du titre : la partie la plus grande portant un lien au texte long. */
function titleOf(list: List, found: Part[]): { part: Part; selector: string } | null {
  const candidates = found.filter(
    (p) => !p.companion && p.text.length >= 12 && (p.tag === 'a' || p.element.querySelector('a')),
  );
  const best = candidates.sort(
    (a, b) => b.fontSize - a.fontSize || b.text.length - a.text.length,
  )[0];
  if (!best) return null;
  if (best.tag === 'a') return { part: best, selector: best.selector };
  for (const selector of [`${best.selector} > a`, `${best.selector} a`]) {
    if (count(selector) >= list.items.length * 0.8) return { part: best, selector };
  }
  return null;
}

/**
 * Carte des rôles pour le compilateur de thème (`shared/theme.ts`) : sélecteurs vérifiés de la
 * barre du haut, du pied, des surfaces, et de la liste principale (élément, lignes compagnes,
 * espaceur, titre, métadonnées). Le titre et les métadonnées sont déduits des parties récurrentes.
 */
export function roleMap(): RoleMap {
  const headerElement = pickRole(ROLES[0][1], true);
  const footerElement = pickRole(ROLES[1][1], false);
  const header = headerElement ? uniqueSelector(headerElement) : null;
  const footer = footerElement ? uniqueSelector(footerElement) : null;
  const main = findLists()[0] ?? null;

  let list: RoleMap['list'] = null;
  if (main) {
    const rows = companions(main);
    const found = collectParts(main, [main.itemSelector, ...rows]);
    const title = titleOf(main, found);
    const titleElement = title ? document.querySelector(title.selector) : null;
    const meta = found
      .filter((p) => {
        if (p === title?.part || p.count > main.items.length * 1.2) return false;
        // Un ancêtre du titre (sa cellule) n'est pas une métadonnée.
        if (titleElement && p.element.contains(titleElement)) return false;
        // Ce qui accompagne le lien du titre dans son bloc (domaine, étiquette) est secondaire.
        const besideTitle = !!title && title.part.element.contains(p.element);
        return (
          besideTitle ||
          p.companion ||
          p.text.length <= 4 ||
          (title ? p.fontSize < title.part.fontSize : false)
        );
      })
      .map((p) => p.selector);
    list = {
      container: uniqueSelector(main.container),
      item: main.itemSelector,
      table: main.items[0]!.tagName === 'TR',
      companions: rows,
      spacer: spacerAfter(main, rows.at(-1) ?? main.itemSelector),
      title: title?.selector ?? null,
      meta,
    };
  }

  const surfaces = collectSurfaces()
    .filter(
      (s) => !headerElement || (s.element !== headerElement && !headerElement.contains(s.element)),
    )
    .map((s) => ({
      selector: s.selector,
      containsList: !!main && s.element.contains(main.items[0]!),
    }));
  const mainElement =
    document.querySelector('main, [role="main"]') ??
    (main ? collectSurfaces().find((s) => s.element.contains(main.items[0]!))?.element : null);
  return {
    header,
    footer,
    surfaces,
    hasBgcolor: count('[bgcolor]') > 0,
    present: {
      headings: !!document.querySelector('h1, h2, h3, h4'),
      inputs: !!document.querySelector('input:not([type="hidden"]), textarea, select'),
    },
    main: mainElement ? uniqueSelector(mainElement) : null,
    list,
  };
}
