import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isOnboardingSeen,
  onInstalledOnboarding,
  ONBOARDING_KEY,
  resetOnboarding,
} from '../src/shared/onboarding';
import {
  centerBubble,
  cursorPoint,
  GAP,
  GUTTER,
  placeBubble,
} from '../src/panel/onboarding/placement';
import { stepDuration, TOUR_STEPS } from '../src/panel/onboarding/steps';

const viewport = { width: 360, height: 640 };
const bubble = { width: 300, height: 120 };

describe('placeBubble', () => {
  it('place la bulle sous la zone quand il y a la place', () => {
    const p = placeBubble({ x: 40, y: 100, width: 120, height: 36 }, bubble, viewport);
    expect(p.side).toBe('below');
    expect(p.y).toBe(100 + 36 + GAP);
  });

  it('passe au-dessus près du bas du panneau', () => {
    const p = placeBubble({ x: 40, y: 560, width: 200, height: 40 }, bubble, viewport);
    expect(p.side).toBe('above');
    expect(p.y + bubble.height).toBeLessThanOrEqual(560);
  });

  it('ne sort jamais à gauche ni à droite', () => {
    const left = placeBubble({ x: 0, y: 20, width: 30, height: 30 }, bubble, viewport);
    const right = placeBubble({ x: 330, y: 20, width: 30, height: 30 }, bubble, viewport);
    expect(left.x).toBe(GUTTER);
    expect(right.x + right.width).toBe(viewport.width - GUTTER);
  });

  it('se rétrécit dans un panneau très étroit', () => {
    const p = placeBubble({ x: 10, y: 20, width: 40, height: 30 }, bubble, {
      width: 280,
      height: 500,
    });
    expect(p.width).toBe(280 - 2 * GUTTER);
    expect(p.x).toBe(GUTTER);
  });

  it('reste dans l’écran quand ni dessous ni dessus ne suffisent', () => {
    const p = placeBubble({ x: 20, y: 60, width: 300, height: 120 }, bubble, {
      width: 360,
      height: 260,
    });
    expect(p.y).toBeGreaterThanOrEqual(GUTTER);
    expect(p.y + bubble.height).toBeLessThanOrEqual(260 - GUTTER);
  });

  it('centre la bulle de fin', () => {
    const p = centerBubble(bubble, viewport);
    expect(p.x).toBe((viewport.width - 300) / 2);
    expect(p.y).toBe((viewport.height - 120) / 2);
  });

  it('pointe le curseur à l’intérieur de la zone', () => {
    const target = { x: 10, y: 10, width: 8, height: 20 };
    const point = cursorPoint(target);
    expect(point.x).toBeGreaterThanOrEqual(target.x);
    expect(point.x).toBeLessThanOrEqual(target.x + target.width);
    expect(point.y).toBeGreaterThan(target.y);
    expect(point.y).toBeLessThan(target.y + target.height);
  });
});

describe('TOUR_STEPS', () => {
  it('a des cibles uniques et des textes non vides', () => {
    const targets = TOUR_STEPS.map((s) => s.target);
    expect(new Set(targets).size).toBe(targets.length);
    for (const step of TOUR_STEPS) {
      expect(step.title.trim()).not.toBe('');
      expect(step.body.trim()).not.toBe('');
    }
  });

  it('laisse au moins 3,5 s par zone', () => {
    for (const step of TOUR_STEPS) expect(stepDuration(step)).toBeGreaterThanOrEqual(3500);
  });
});

describe('onInstalledOnboarding', () => {
  let store: Record<string, unknown>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
          set: async (items: Record<string, unknown>) => void Object.assign(store, items),
          remove: async (key: string) => void delete store[key],
        },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('une installation neuve garde la présentation', async () => {
    await onInstalledOnboarding('install');
    expect(await isOnboardingSeen()).toBe(false);
  });

  it('une mise à jour la marque comme vue', async () => {
    await onInstalledOnboarding('update');
    expect(store[ONBOARDING_KEY]).toMatchObject({ seenAt: expect.any(String) });
  });

  it('une mise à jour ne réécrit pas une date existante', async () => {
    store[ONBOARDING_KEY] = { seenAt: '2026-01-01T00:00:00.000Z' };
    await onInstalledOnboarding('update');
    expect(store[ONBOARDING_KEY]).toEqual({ seenAt: '2026-01-01T00:00:00.000Z' });
  });

  it('« Revoir » supprime la clé', async () => {
    store[ONBOARDING_KEY] = { seenAt: 'x' };
    await resetOnboarding();
    expect(await isOnboardingSeen()).toBe(false);
  });
});
