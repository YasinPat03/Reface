import { motion, useReducedMotion } from 'motion/react';
import { CURSOR_TRAVEL_MS } from './steps';

/** Curseur scripté : il glisse vers la zone, puis fait une petite onde « clic » en arrivant. */
export function TourCursor({
  x,
  y,
  step,
  visible,
}: {
  x: number;
  y: number;
  step: number;
  visible: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="tour-cursor"
      aria-hidden="true"
      data-testid="tour-cursor"
      initial={false}
      animate={{ x, y, opacity: visible ? 1 : 0 }}
      transition={{
        x: { duration: reduce ? 0 : CURSOR_TRAVEL_MS / 1000, ease: [0.45, 0, 0.2, 1] },
        y: { duration: reduce ? 0 : CURSOR_TRAVEL_MS / 1000, ease: [0.3, 0, 0.25, 1] },
        opacity: { duration: 0.25 },
      }}
    >
      {!reduce && visible && (
        <motion.span
          key={step}
          className="tour-ripple"
          initial={{ scale: 0.2, opacity: 0 }}
          animate={{ scale: [0.2, 1.7], opacity: [0.55, 0] }}
          transition={{ delay: CURSOR_TRAVEL_MS / 1000, duration: 0.6, ease: 'easeOut' }}
        />
      )}
      <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
        <path
          d="M2.5 1.8v19.4l5.1-4.6 3.3 7.3 3.4-1.5-3.3-7.2 6.9-.3L2.5 1.8Z"
          className="tour-cursor-arrow"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </motion.div>
  );
}
