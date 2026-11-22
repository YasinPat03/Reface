import { motion, useAnimate, useReducedMotion } from 'motion/react';
import { useEffect } from 'react';
import { TextAnimate } from '@/components/ui/text-animate';
import { Brand } from '../../shared/Brand';

/** Logo en grand au centre (son animation d'entrée dure 1,6 s), avant de rejoindre l'en-tête. */
const HOLD_MS = 2600;
const FLY_S = 0.75;

export function Intro({
  appearance,
  onDone,
  onSkip,
}: {
  appearance: 'light' | 'dark';
  onDone: () => void;
  onSkip: () => void;
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reduce = useReducedMotion();

  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(async () => {
      const logo = scope.current?.querySelector<HTMLElement>('.onboarding-logo');
      const header = document.querySelector<HTMLElement>('[data-tour="brand"]');
      const fade = animate(
        '.onboarding-intro-backdrop, .onboarding-intro-text, .onboarding-intro-skip',
        { opacity: 0 },
        { duration: reduce ? 0.2 : FLY_S },
      );
      if (logo && header && !reduce) {
        const from = logo.getBoundingClientRect();
        const to = header.getBoundingClientRect();
        await Promise.all([
          animate(
            logo,
            {
              x: to.left + to.width / 2 - (from.left + from.width / 2),
              y: to.top + to.height / 2 - (from.top + from.height / 2),
              scale: to.width / from.width,
            },
            { duration: FLY_S, ease: [0.22, 1, 0.36, 1] },
          ),
          fade,
        ]);
        // Le grand logo se pose sur celui de l'en-tête, puis s'efface.
        await animate(logo, { opacity: 0 }, { duration: 0.15 });
      } else {
        await Promise.all([fade, logo && animate(logo, { opacity: 0 }, { duration: 0.2 })]);
      }
      if (alive) onDone();
    }, HOLD_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [animate, scope, reduce, onDone]);

  return (
    <div
      ref={scope}
      className="onboarding-intro"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to ReFace"
      data-testid="onboarding"
      data-phase="intro"
      onClick={onDone}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onSkip();
      }}
    >
      <motion.div
        className="onboarding-intro-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />
      <div className="onboarding-intro-center">
        <div className="onboarding-logo">
          <Brand appearance={appearance} className="brand-intro" />
        </div>
        <div className="onboarding-intro-text">
          <TextAnimate as="p" by="word" animation="blurInUp" delay={0.9} className="eyebrow">
            Welcome
          </TextAnimate>
          <TextAnimate
            as="h1"
            by="word"
            animation="blurInUp"
            delay={1.15}
            className="onboarding-tagline"
          >
            A page made to measure.
          </TextAnimate>
        </div>
      </div>
      <button
        type="button"
        className="text-button onboarding-intro-skip"
        autoFocus
        onClick={(event) => {
          event.stopPropagation();
          onSkip();
        }}
      >
        Skip the tour
      </button>
    </div>
  );
}
