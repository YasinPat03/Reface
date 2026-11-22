import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode, Ref } from 'react';
import { BlurFade } from '@/components/ui/blur-fade';
import { TypingAnimation } from '@/components/ui/typing-animation';
import type { BubblePlacement } from './placement';
import { TEXT_DELAY_MS, TYPE_SPEED_MS } from './steps';

/**
 * Bulle d'explication. Le conteneur reste monté (le focus ne saute pas) et glisse d'une zone à
 * l'autre ; seul son contenu réapparaît à chaque étape.
 */
export function TourBubble({
  ref,
  placement,
  notchX,
  step,
  title,
  body,
  footer,
  onPointerEnter,
  onPointerLeave,
}: {
  ref: Ref<HTMLDivElement>;
  placement: BubblePlacement;
  notchX: number | null;
  step: number;
  title: string;
  body: string;
  footer: ReactNode;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      className="tour-bubble"
      data-testid="tour-bubble"
      data-side={placement.side}
      data-notch={notchX === null ? undefined : 'true'}
      style={{
        width: placement.width,
        ['--notch-x' as string]: `${notchX ?? 0}px`,
      }}
      initial={{ x: placement.x, y: placement.y, opacity: 0 }}
      animate={{ x: placement.x, y: placement.y, opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
      onClick={(event) => event.stopPropagation()}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <BlurFade key={step} delay={reduce ? 0 : TEXT_DELAY_MS / 1000} duration={0.35} direction="up">
        <p className="tour-bubble-title" aria-hidden="true">
          {title}
        </p>
        {/* Le texte fantôme réserve la hauteur finale : la bulle ne grandit pas pendant la frappe. */}
        <p className="tour-bubble-text" aria-hidden="true">
          <span className="tour-bubble-ghost">{body}</span>
          {reduce ? (
            <span>{body}</span>
          ) : (
            <TypingAnimation
              key={step}
              as="span"
              startOnView={false}
              delay={TEXT_DELAY_MS + 150}
              typeSpeed={TYPE_SPEED_MS}
              showCursor
              cursorStyle="line"
              className="tour-bubble-typed"
            >
              {body}
            </TypingAnimation>
          )}
        </p>
      </BlurFade>
      <div className="tour-bubble-footer">{footer}</div>
    </motion.div>
  );
}
