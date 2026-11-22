// Placement de la bulle à côté de la zone visée. Fonctions pures, testées dans tests/onboarding.test.ts.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface BubblePlacement {
  x: number;
  y: number;
  width: number;
  side: 'below' | 'above';
}

/** Marge minimale avec les bords du panneau. */
export const GUTTER = 16;
/** Écart entre la zone et la bulle (laisse la place à la flèche du curseur). */
export const GAP = 22;
/** Largeur maximale de la bulle. */
export const BUBBLE_WIDTH = 300;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** La bulle va sous la zone, ou au-dessus s'il manque de place, sans jamais sortir de l'écran. */
export function placeBubble(target: Rect, bubble: Size, viewport: Size): BubblePlacement {
  const width = Math.min(BUBBLE_WIDTH, bubble.width, viewport.width - 2 * GUTTER);
  const bottom = target.y + target.height;
  const below = bottom + GAP;
  const above = target.y - GAP - bubble.height;
  const fitsBelow = below + bubble.height <= viewport.height - GUTTER;
  const fitsAbove = above >= GUTTER;
  const side =
    fitsBelow || (!fitsAbove && viewport.height - bottom >= target.y) ? 'below' : 'above';
  const y = clamp(
    side === 'below' ? below : above,
    GUTTER,
    Math.max(GUTTER, viewport.height - GUTTER - bubble.height),
  );
  const x = clamp(
    target.x + target.width / 2 - width / 2,
    GUTTER,
    Math.max(GUTTER, viewport.width - GUTTER - width),
  );
  return { x, y, width, side };
}

/** Pointe du curseur : un peu à droite du centre, comme une main qui survole. */
export function cursorPoint(target: Rect): { x: number; y: number } {
  return {
    x: target.x + Math.min(target.width * 0.62, target.width - 8),
    y: target.y + target.height * 0.55,
  };
}

/** Bulle de fin, au centre du panneau. */
export function centerBubble(bubble: Size, viewport: Size): BubblePlacement {
  const width = Math.min(BUBBLE_WIDTH, bubble.width, viewport.width - 2 * GUTTER);
  return {
    x: Math.max(GUTTER, (viewport.width - width) / 2),
    y: Math.max(GUTTER, (viewport.height - bubble.height) / 2),
    width,
    side: 'below',
  };
}
