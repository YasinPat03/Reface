import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { BorderBeam } from '@/components/ui/border-beam';
import {
  BUBBLE_WIDTH,
  centerBubble,
  cursorPoint,
  placeBubble,
  type Rect,
  type Size,
} from './placement';
import { CURSOR_TRAVEL_MS, stepDuration, TOUR_STEPS } from './steps';
import { TourBubble } from './TourBubble';
import { TourCursor } from './TourCursor';

const PAD = 6;
const FINAL_TITLE = 'C’est parti';
const FINAL_BODY =
  'Ouvrez une page, décrivez ce que vous voulez changer : ReFace s’occupe du reste.';

const viewportSize = (): Size => ({ width: window.innerWidth, height: window.innerHeight });
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Le curseur part du logo de l'en-tête, là où l'intro vient de le poser. */
function brandCenter() {
  const r = document.querySelector('[data-tour="brand"]')?.getBoundingClientRect();
  return r
    ? { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

export function Tour({ onFinish }: { onFinish: () => void }) {
  const total = TOUR_STEPS.length;
  /** `index === total` : la bulle de fin. */
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState(viewportSize);
  const [bubbleHeight, setBubbleHeight] = useState(140);
  const [hovered, setHovered] = useState(false);
  const [start] = useState(brandCenter);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const final = index >= total;
  const step = TOUR_STEPS[Math.min(index, total - 1)]!;

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, total)), [total]);
  const previous = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  // La zone visée : amenée à l'écran, mesurée, puis suivie (redimensionnement, défilement).
  useEffect(() => {
    if (final) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) {
      const skip = window.setTimeout(next, 0); // zone absente : on passe à la suivante
      return () => window.clearTimeout(skip);
    }
    el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setRect({ x: r.x, y: r.y, width: r.width, height: r.height });
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [final, step.target, next, reduce]);

  useEffect(() => {
    const onResize = () => setViewport(viewportSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Hauteur réelle de la bulle, pour la placer au-dessus ou en dessous.
  useEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBubbleHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Lecture automatique ; elle attend tant que le pointeur est sur la bulle.
  useEffect(() => {
    if (final || hovered) return;
    const timer = window.setTimeout(next, stepDuration(step));
    return () => window.clearTimeout(timer);
  }, [final, hovered, step, next]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onFinish();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      previous();
    } else if (
      event.key === 'ArrowRight' ||
      (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement))
    ) {
      event.preventDefault();
      if (final) onFinish();
      else next();
    }
  }

  const bubble = { width: BUBBLE_WIDTH, height: bubbleHeight };
  const placement =
    final || !rect ? centerBubble(bubble, viewport) : placeBubble(rect, bubble, viewport);
  const point = rect ? cursorPoint(rect) : start;
  const notchX = final || !rect ? null : clamp(point.x - placement.x, 18, placement.width - 18);
  const spotlight =
    final || !rect
      ? { x: viewport.width / 2, y: viewport.height / 2, width: 0, height: 0 }
      : {
          x: rect.x - PAD,
          y: rect.y - PAD,
          width: rect.width + 2 * PAD,
          height: rect.height + 2 * PAD,
        };

  return (
    <div
      className="tour"
      role="dialog"
      aria-modal="true"
      aria-label="Présentation de ReFace"
      data-testid="onboarding"
      data-phase="tour"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onClick={final ? onFinish : next}
    >
      <motion.div
        className="tour-spotlight"
        data-testid="tour-spotlight"
        data-target={final ? undefined : step.target}
        initial={{ x: 0, y: 0, width: viewport.width, height: viewport.height, opacity: 0 }}
        animate={{ ...spotlight, opacity: 1 }}
        transition={{
          duration: reduce ? 0 : CURSOR_TRAVEL_MS / 1000,
          ease: [0.22, 1, 0.36, 1],
          opacity: { duration: 0.3 },
        }}
      >
        {!reduce && !final && (
          <BorderBeam
            size={64}
            duration={5}
            borderWidth={1.5}
            colorFrom="var(--accent)"
            colorTo="var(--line-strong)"
          />
        )}
      </motion.div>
      <TourCursor x={point.x} y={point.y} step={index} visible={!final && rect !== null} />
      <TourBubble
        ref={bubbleRef}
        placement={placement}
        notchX={notchX}
        step={index}
        title={final ? FINAL_TITLE : step.title}
        body={final ? FINAL_BODY : step.body}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        footer={
          final ? (
            <button type="button" className="button button-primary" autoFocus onClick={onFinish}>
              Commencer
            </button>
          ) : (
            <>
              <span className="tour-progress" data-testid="tour-progress">
                {index + 1} / {total}
              </span>
              <button type="button" className="text-button" autoFocus onClick={onFinish}>
                Passer
              </button>
            </>
          )
        }
      />
      <p className="sr-only" aria-live="polite">
        {final
          ? `${FINAL_TITLE}. ${FINAL_BODY}`
          : `Étape ${index + 1} sur ${total}. ${step.title}. ${step.body}`}
      </p>
    </div>
  );
}
