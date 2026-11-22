import { Intro } from './Intro';
import { Tour } from './Tour';
import type { OnboardingPhase } from './useOnboarding';
import './onboarding.css';

/** Présentation du premier lancement : le logo en grand, puis la visite guidée du panneau. */
export function Onboarding({
  phase,
  appearance,
  onIntroDone,
  onFinish,
}: {
  phase: OnboardingPhase;
  appearance: 'light' | 'dark';
  onIntroDone: () => void;
  onFinish: () => void;
}) {
  if (phase === 'intro')
    return <Intro appearance={appearance} onDone={onIntroDone} onSkip={onFinish} />;
  if (phase === 'tour') return <Tour onFinish={onFinish} />;
  return null;
}
