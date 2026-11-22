// Garde-fou de mise en page : compare les textes lisibles AVANT et APRÈS la preview.
// Détecte les régressions qu'une modif peut causer par effet de bord : texte écrasé,
// texte disparu sans qu'on l'ait demandé, texte recouvert par une image agrandie.
import { paintedBox } from './qualityCheck';

const MAX_TEXTS = 250;

interface Snapshot {
  element: Element;
  rect: DOMRect;
  visible: boolean;
}

/** Éléments portant du texte, visibles dans les 2 premiers écrans. */
function textElements(): Element[] {
  const out: Element[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  for (let node = walker.nextNode(); node && out.length < MAX_TEXTS; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || seen.has(parent) || (node.nodeValue?.trim().length ?? 0) < 4) continue;
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION)$/.test(parent.tagName)) continue;
    seen.add(parent);
    const rect = parent.getBoundingClientRect();
    if (rect.top > innerHeight * 2 || rect.bottom < 0 || rect.width < 60 || rect.height < 8)
      continue;
    out.push(parent);
  }
  return out;
}

function snapshot(elements: Element[]): Snapshot[] {
  return elements.map((element) => ({
    element,
    rect: element.getBoundingClientRect(),
    visible: element.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }) ?? true,
  }));
}

function overlapRatio(a: DOMRect, b: DOMRect): number {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return (w * h) / Math.max(1, b.width * b.height);
}

const short = (element: Element) =>
  (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);

/**
 * Médias visibles (pour détecter un texte recouvert par une image), découpés à leur zone peinte :
 * les miniatures d'une liste repliée (chapitres YouTube) sont masquées par un overflow:hidden.
 */
function mediaRects(): DOMRect[] {
  return [...document.querySelectorAll('img, video, picture, canvas')]
    .filter((m) => m.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }) ?? true)
    .map((m) => {
      const r = m.getBoundingClientRect();
      const clip = r.width > 40 && r.height > 30 ? paintedBox(m) : null;
      if (!clip) return r;
      const left = Math.max(r.left, clip.left);
      const top = Math.max(r.top, clip.top);
      return new DOMRect(
        left,
        top,
        Math.min(r.right, clip.right) - left,
        Math.min(r.bottom, clip.bottom) - top,
      );
    })
    .filter((r) => r.width > 40 && r.height > 30 && r.top < innerHeight * 2);
}

/** Mesure de référence, page SANS la preview. */
export interface LayoutBefore {
  elements: Element[];
  snapshot: Snapshot[];
  media: DOMRect[];
}

export function layoutBefore(): LayoutBefore {
  const elements = textElements();
  return { elements, snapshot: snapshot(elements), media: mediaRects() };
}

/**
 * Régressions observées avec la preview actuellement appliquée, par rapport à `reference`
 * (mesurée sans elle), en anglais pour le LLM. Les deux mesures se font dans des états que les
 * garde-fous traversent déjà : aucun recalcul de la page en plus.
 * `isIntended(el)` : vrai si l'élément est caché exprès (op hide / display:none demandé).
 */
export function layoutRegressions(
  reference: LayoutBefore,
  isIntended: (element: Element) => boolean,
): string[] {
  const elements = reference.elements;
  const before = reference.snapshot;
  const mediaBefore = reference.media;
  const after = snapshot(elements);
  const mediaAfter = mediaRects();

  const squeezed: string[] = [];
  const vanished: string[] = [];
  const covered: string[] = [];
  after.forEach((now, i) => {
    const was = before[i]!;
    if (!was.visible || isIntended(now.element)) return;
    if (!now.visible || now.rect.width < 2 || now.rect.height < 2) {
      vanished.push(`"${short(now.element)}" (was ${Math.round(was.rect.width)}px wide)`);
    } else if (now.rect.width < 40 && now.rect.width < was.rect.width * 0.5) {
      squeezed.push(
        `"${short(now.element)}" ${Math.round(was.rect.width)}px→${Math.round(now.rect.width)}px`,
      );
    } else if (
      mediaAfter.some((m) => overlapRatio(m, now.rect) > 0.3) &&
      !mediaBefore.some((m) => overlapRatio(m, was.rect) > 0.3)
    ) {
      covered.push(`"${short(now.element)}"`);
    }
  });

  const issues: string[] = [];
  // Quelques cas isolés sont normaux (reflow) : on ne signale que des régressions nettes.
  if (vanished.length >= 2)
    issues.push(
      `${vanished.length} text elements disappeared, e.g. ${vanished.slice(0, 3).join(', ')}`,
    );
  if (squeezed.length >= 2)
    issues.push(
      `${squeezed.length} text elements squeezed to an unreadable width, e.g. ${squeezed.slice(0, 3).join(', ')}`,
    );
  if (covered.length >= 1)
    issues.push(
      `${covered.length} text elements now overlapped by images, e.g. ${covered.slice(0, 3).join(', ')}`,
    );
  return issues;
}
