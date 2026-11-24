// Composants connus de la page (skill de site, pré-étude), vérifiés sur la page vivante.
// Le LLM ne reçoit que des sélecteurs qui visent vraiment quelque chose ici, avec un [#n] :
// un skill périmé se dégrade proprement (« not on this page ») au lieu d'induire en erreur.
import { isSafeSelector } from '../shared/cssSafety';
import type { StudiedRegion, StudyComponent } from '../shared/study';
import type { Probe } from '../shared/types';
import { appendRegion, regionAt } from './distill';
import { buildSelectors, groupSelector } from './selectors';

const MAX_LINES = 24;
const MAX_CHARS = 2_600;

function visible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  return typeof element.checkVisibility === 'function'
    ? element.checkVisibility({ visibilityProperty: true, opacityProperty: true })
    : true;
}

function matches(selector: string): Element[] {
  if (!isSafeSelector(selector)) return [];
  try {
    return [...document.querySelectorAll(selector)];
  } catch {
    return [];
  }
}

interface Found {
  probe: Probe;
  selector: string;
  visible: Element[];
  hidden: number;
}

/** 1er sélecteur qui vise un élément visible ; à défaut, le 1er qui vise un élément caché. */
function locateProbe(probe: Probe): Found | null {
  let fallback: Found | null = null;
  for (const selector of probe.selectors) {
    const all = matches(selector);
    if (!all.length) continue;
    const shown = all.filter(visible);
    const found = { probe, selector, visible: shown, hidden: all.length - shown.length };
    if (shown.length) return found;
    fallback ??= found;
  }
  return fallback;
}

/**
 * Une ligne par composant présent, ceux que la demande cite en premier :
 * `- Shorts shelf: "grid-shelf-view-model" ×2 visible [#151] (all similar) ← mentioned in the request`
 */
export function describeComponents(probes: Probe[]): string {
  return componentReport(probes).text;
}

/** Comme `describeComponents`, avec le nombre de composants introuvables (étude périmée ?). */
export function componentReport(probes: Probe[]): { text: string; missing: number } {
  const found: Found[] = [];
  const absent: string[] = [];
  for (const probe of probes) {
    const hit = locateProbe(probe);
    // Présent mais invisible (menu replié, autre gabarit gardé en mémoire par une SPA) : signalé
    // seulement si la demande le cite, sinon c'est du bruit.
    if (hit && (hit.visible.length || probe.asked)) found.push(hit);
    else if (!hit) absent.push(probe.name);
  }
  found.sort((a, b) => Number(b.probe.asked) - Number(a.probe.asked));
  const lines: string[] = [];
  let size = 0;
  for (const hit of found.slice(0, MAX_LINES)) {
    const { probe, selector } = hit;
    const index = hit.visible[0] ? appendRegion(hit.visible[0]) : -1;
    const count = hit.visible.length
      ? `×${hit.visible.length} visible${hit.hidden ? ` (+${hit.hidden} hidden)` : ''}`
      : `×${hit.hidden} hidden now (collapsed, lazy or another layout)`;
    const line = [
      `- ${probe.name}: ${JSON.stringify(selector)} ${count}`,
      index >= 0 ? ` [#${index}]` : '',
      probe.all ? ' (repeated: target all of them with this selector)' : '',
      probe.asked ? ' ← mentioned in the request' : '',
    ].join('');
    if (size + line.length > MAX_CHARS) break;
    size += line.length + 1;
    lines.push(line);
  }
  const asked = absent.filter((name) => probes.find((p) => p.name === name)?.asked);
  if (asked.length) lines.push(`- Mentioned but NOT on this page: ${asked.join(', ')}`);
  return { text: lines.join('\n'), missing: absent.length };
}

/**
 * Pré-étude : les régions nommées par le LLM deviennent des sélecteurs vérifiés (de groupe pour
 * un élément répété). Ce sont eux qui sont gardés, pas les index (propres à une distillation).
 */
export function resolveComponents(regions: StudiedRegion[]): StudyComponent[] {
  const out: StudyComponent[] = [];
  const used = new Set<string>();
  for (const region of regions) {
    const element = regionAt(region.regionIndex);
    if (!element?.isConnected) continue;
    const group = region.scope === 'all' ? groupSelector(element) : null;
    const selectors = (group ? [group] : buildSelectors(element).slice(0, 2)).filter(
      (selector) => isSafeSelector(selector) && !used.has(selector),
    );
    if (!selectors.length) continue;
    selectors.forEach((selector) => used.add(selector));
    out.push({ name: region.name, aliases: region.aliases, selectors, all: !!group });
  }
  return out;
}
