// Outils d'examen de la page (lecture seule), appelés par le LLM pendant la génération :
// - find_elements : retrouver ce que l'utilisateur nomme quand le plan ne le montre pas ;
// - inspect_regions : voir l'intérieur d'une région (enfants, mise en page, contraintes de taille).
// Les éléments trouvés reçoivent un [#n] (appendRegion) : le LLM les vise comme les régions du
// plan, et c'est toujours l'extension qui construit les sélecteurs.
// Confidentialité : jamais de valeurs de formulaire ni de texte éditable, textes expurgés,
// éléments cachés donnés par leur sélecteur seulement.
import { isSafeSelector } from '../shared/cssSafety';
import { mentions, normalizeWords } from '../shared/skillFormat';
import type { InvestigateCall, InvestigateResult } from '../shared/types';
import { anchorSignature, sizeConstraints } from './context';
import {
  LANDMARKS,
  SKIP,
  appendRegion,
  countMatches,
  currentDistillId,
  describe,
  isUserInput,
  isVisible,
  redact,
  regionAt,
  repeatInfo,
  sameBox,
} from './distill';
import { buildSelectors, groupSelector, isStableId, stableClasses } from './selectors';

const MAX_MATCHES = 5;
const MAX_SCANNED = 60_000;
const MAX_CHILD_LINES = 25;

function shown(element: Element): boolean {
  return isVisible(element, element.getBoundingClientRect());
}

/** Une requête qui ressemble à un sélecteur CSS (et non à des mots de la page). */
function looksLikeSelector(query: string): boolean {
  return /^[.#[]/.test(query) || /[>[\]:=~+]/.test(query) || /^[a-z]+(?:-[a-z0-9]+)+$/.test(query);
}

/** Texte propre d'un élément : ses nœuds texte directs (pas ceux de ses enfants). */
function ownText(element: Element): string {
  if (isUserInput(element)) return '';
  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += ` ${node.nodeValue ?? ''}`;
  }
  return text.replace(/\s+/g, ' ').trim();
}

const SEARCHED_ATTRIBUTES = ['aria-label', 'title', 'alt', 'placeholder', 'data-testid'];

/** Mots d'un id, de classes stables ou d'une balise : « ytVoiceSearchButton » → « yt voice search button ». */
function tokens(element: Element): string {
  const raw = [
    element.tagName.includes('-') ? element.tagName.toLowerCase() : '',
    element.id && isStableId(element.id) ? element.id : '',
    ...stableClasses(element),
  ].join(' ');
  return raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ');
}

/** Score d'une correspondance : attributs (3), texte propre (2), id/classes/balise (1), 0 sinon. */
function score(element: Element, words: string[]): number {
  const all = (haystack: string) => !!haystack && words.every((word) => mentions(haystack, word));
  for (const name of SEARCHED_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value && all(value)) return 3;
  }
  if (all(ownText(element))) return 2;
  if (all(tokens(element))) return 1;
  return 0;
}

/** Ancêtre « parlant » : balise custom, id stable, role, landmark, élément de liste répétée. */
function meaningful(element: Element): boolean {
  return (
    element.tagName.includes('-') ||
    (!!element.id && isStableId(element.id)) ||
    element.hasAttribute('role') ||
    LANDMARKS.has(element.tagName) ||
    /^(?:LI|ARTICLE|SECTION|TR|TABLE|FIGURE)$/.test(element.tagName) ||
    repeatInfo(element).total >= 3
  );
}

function short(element: Element, index: number): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id && isStableId(element.id) ? `#${element.id}` : '';
  const cls = stableClasses(element)[0];
  const repeat = repeatInfo(element);
  return `[#${index}] <${tag}${id}${!id && cls ? `.${cls}` : ''}>${repeat.total >= 3 ? ` (×${repeat.total} similar)` : ''}`;
}

function selectorsLine(element: Element): string {
  const unique = buildSelectors(element)[0];
  const group = groupSelector(element);
  const parts = [
    unique ? `selector ${JSON.stringify(unique)}` : '',
    group ? `all similar ${JSON.stringify(group)} ×${countMatches(group)}` : '',
  ].filter(Boolean);
  return parts.length ? `   ${parts.join(' · ')}` : '';
}

function describeMatch(element: Element, rank: number): string {
  const rect = element.getBoundingClientRect();
  const index = appendRegion(element);
  const lines = [`${rank}. ${describe(element, index, rect, 0)}`];
  const selectors = selectorsLine(element);
  if (selectors) lines.push(selectors);
  const ancestors: string[] = [];
  for (
    let e = element.parentElement;
    e && e !== document.body && ancestors.length < 3;
    e = e.parentElement
  ) {
    if (!meaningful(e)) continue;
    const i = appendRegion(e);
    const group = repeatInfo(e).total >= 3 ? groupSelector(e) : null;
    ancestors.push(`${short(e, i)}${group ? ` ${JSON.stringify(group)}` : ''}`);
  }
  if (ancestors.length) lines.push(`   inside: ${ancestors.join(' < ')}`);
  return lines.join('\n');
}

function findOne(query: string, root: Element, onlyFound = false): string {
  const label = JSON.stringify(redact(query).slice(0, 60));
  if (looksLikeSelector(query)) {
    if (!isSafeSelector(query)) return `${label}: selector refused.`;
    let all: Element[];
    try {
      all = [...root.querySelectorAll(query)].slice(0, 50);
    } catch {
      return `${label}: invalid selector.`;
    }
    const visible = all.filter(shown);
    if (!all.length) return `${label}: matches nothing on this page.`;
    return [
      `${label}: selector matches ${countMatches(query)} element(s), ${visible.length} visible.`,
      ...visible.slice(0, 3).map((element, i) => describeMatch(element, i + 1)),
    ].join('\n');
  }
  const words = normalizeWords(query)
    .split(/\s+/)
    .filter((word) => word.length > 1);
  if (!words.length) return `${label}: empty query.`;
  const matches: { element: Element; score: number }[] = [];
  let hidden = 0;
  const hiddenSelectors = new Set<string>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const element = node as Element;
      if (SKIP.has(element.tagName) || element.id === 'bp-styles' || element.id === 'bp-preview')
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let scanned = 0;
  for (let node = walker.nextNode(); node && scanned < MAX_SCANNED; node = walker.nextNode()) {
    scanned++;
    const element = node as Element;
    const s = score(element, words);
    if (!s) continue;
    if (shown(element)) matches.push({ element, score: s });
    else {
      hidden++;
      const selector = buildSelectors(element)[0] ?? anchorSignature(element);
      if (selector && hiddenSelectors.size < 3) hiddenSelectors.add(selector);
    }
  }
  // Un élément dont un ancêtre retenu correspond déjà au même niveau n'apporte rien de plus.
  const kept: { element: Element; score: number }[] = [];
  for (const match of matches.sort((a, b) => b.score - a.score)) {
    if (kept.some((k) => k.element.contains(match.element) && k.score >= match.score)) continue;
    kept.push(match);
    if (kept.length >= MAX_MATCHES) break;
  }
  if (!kept.length) {
    if (onlyFound) return '';
    return hidden
      ? `${label}: only hidden matches (collapsed menu, closed panel or other layout): ${[...hiddenSelectors].map((s) => JSON.stringify(s)).join(', ')} ×${hidden}.`
      : `${label}: no match. The page may use other words (its own language or wording): try them, a selector, or inspect_regions on a parent region.`;
  }
  return [
    `${label}: ${matches.length} visible match(es)${hidden ? `, ${hidden} hidden` : ''}${matches.length > kept.length ? `, best ${kept.length} shown` : ''}`,
    ...kept.map((match, i) => describeMatch(match.element, i + 1)),
    hiddenSelectors.size
      ? `hidden (no text shown): ${[...hiddenSelectors].map((s) => JSON.stringify(s)).join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const MAX_MATCHES_CHARS = 1_800;

/**
 * Pré-recherche des mots de la demande (avant le 1er appel au LLM) : seulement les requêtes qui
 * trouvent un élément visible, dans la limite d'environ 1 800 caractères.
 */
export function requestMatches(queries: string[]): string {
  const out: string[] = [];
  let size = 0;
  for (const query of queries) {
    if (looksLikeSelector(query)) continue;
    const text = findOne(query, document.body, true);
    if (!text || size + text.length > MAX_MATCHES_CHARS) continue;
    size += text.length;
    out.push(text);
  }
  return out.join('\n');
}

/** Recherche de plusieurs requêtes, dans toute la page ou dans une région. */
export function findElements(queries: string[], within = -1): InvestigateResult {
  const root = within >= 0 ? regionAt(within) : document.body;
  const label = `Searching the page for ${queries.map((q) => `“${q.slice(0, 40)}”`).join(', ')}…`;
  if (!root || !root.isConnected)
    return { label, text: `Region [#${within}] is no longer on the page.` };
  return { label, text: queries.map((query) => findOne(query, root)).join('\n') };
}

function layoutLine(element: Element): string {
  const rect = element.getBoundingClientRect();
  const s = getComputedStyle(element);
  const parts = [
    `box ${Math.round(rect.width)}×${Math.round(rect.height)}px`,
    `display:${s.display}`,
    s.position !== 'static' ? `position:${s.position}` : '',
    /flex/.test(s.display) ? `flex-direction:${s.flexDirection} gap:${s.gap}` : '',
    /grid/.test(s.display) ? `grid-template-columns:${s.gridTemplateColumns.slice(0, 80)}` : '',
    s.overflow !== 'visible' ? `overflow:${s.overflow}` : '',
  ].filter(Boolean);
  const parent = element.parentElement;
  if (parent) {
    const p = getComputedStyle(parent);
    const flow = /flex/.test(p.display)
      ? `${p.display} ${p.flexDirection} gap:${p.gap}`
      : /grid/.test(p.display)
        ? `${p.display} columns:${p.gridTemplateColumns.slice(0, 60)}`
        : p.display;
    parts.push(`parent ${anchorSignature(parent) ?? parent.tagName.toLowerCase()} ${flow}`);
  }
  return parts.join(' · ');
}

function styleLine(element: Element): string {
  const s = getComputedStyle(element);
  return `style: background ${s.backgroundColor} · color ${s.color} · font ${s.fontSize}/${s.lineHeight} ${s.fontWeight} ${s.fontFamily.split(',')[0]}`;
}

/** Enfants visibles jusqu'à `depth` niveaux, répétitions résumées, enveloppes doublon traversées. */
function childLines(element: Element, depth: number, out: string[], level = 1): void {
  const parentRect = element.getBoundingClientRect();
  for (const child of element.children) {
    if (out.length >= MAX_CHILD_LINES) return;
    if (SKIP.has(child.tagName)) continue;
    const rect = child.getBoundingClientRect();
    if (!isVisible(child, rect)) continue;
    const repeat = repeatInfo(child);
    if (repeat.total >= 4 && repeat.rank >= 2) continue; // déjà résumé par « similar=×N »
    // Enveloppe sans rien de distinctif qui double son parent : on regarde directement dedans.
    if (sameBox(rect, parentRect) && !meaningful(child) && !ownText(child) && level <= depth) {
      childLines(child, depth, out, level);
      continue;
    }
    const index = appendRegion(child);
    out.push(describe(child, index, rect, level));
    if (level < depth) childLines(child, depth, out, level + 1);
  }
}

export function inspectRegions(indexes: number[], depth: number): InvestigateResult {
  const parts: string[] = [];
  const names: string[] = [];
  for (const index of indexes) {
    const element = regionAt(index);
    if (!element || !element.isConnected) {
      parts.push(`[#${index}] is not on the page anymore (or was never listed).`);
      continue;
    }
    names.push(anchorSignature(element) ?? element.tagName.toLowerCase());
    const rect = element.getBoundingClientRect();
    const lines = [describe(element, index, rect, 0), `  ${layoutLine(element)}`];
    const limits = sizeConstraints(element);
    if (limits) lines.push(`  size limited by: ${limits}`);
    lines.push(`  ${styleLine(element)}`);
    const selectors = selectorsLine(element);
    if (selectors) lines.push(selectors);
    const children: string[] = [];
    childLines(element, Math.min(Math.max(depth, 1), 3), children);
    if (children.length) lines.push(`  children (depth ${depth}):`, ...children);
    else lines.push('  no visible children.');
    parts.push(lines.join('\n'));
  }
  return {
    label: `Looking inside ${names.slice(0, 2).join(', ') || 'the page'}…`,
    text: parts.join('\n\n'),
  };
}

/**
 * Exécute les appels d'un tour. Les index ne valent que pour la distillation qui les a produits :
 * si la page a été relue entre-temps, on le dit au lieu de répondre à côté.
 */
export function investigate(
  distillId: number,
  calls: InvestigateCall[],
): { stale: boolean; results: InvestigateResult[] } {
  if (distillId !== currentDistillId()) {
    return {
      stale: true,
      results: calls.map(() => ({
        label: 'Reading the page…',
        text: 'The page was re-read since: region indexes changed. Use the verified selectors given earlier in selectorHints.',
      })),
    };
  }
  return {
    stale: false,
    results: calls.map((call) =>
      call.tool === 'find_elements'
        ? findElements(call.queries, call.within)
        : inspectRegions(call.regions, call.depth),
    ),
  };
}
