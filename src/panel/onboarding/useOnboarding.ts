import { useCallback, useEffect, useState } from 'react';
import { isOnboardingSeen, markOnboardingSeen, ONBOARDING_KEY } from '../../shared/onboarding';

export type OnboardingPhase = 'loading' | 'intro' | 'tour' | 'done';

/** Phase de la présentation. Une remise à zéro (Options → « Revoir ») la relance aussitôt. */
export function useOnboarding() {
  const [phase, setPhase] = useState<OnboardingPhase>('loading');

  useEffect(() => {
    let alive = true;
    isOnboardingSeen().then(
      (seen) => alive && setPhase(seen ? 'done' : 'intro'),
      () => alive && setPhase('done'),
    );
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (
        area === 'local' &&
        ONBOARDING_KEY in changes &&
        changes[ONBOARDING_KEY]?.newValue === undefined
      )
        setPhase('intro');
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  const startTour = useCallback(() => setPhase('tour'), []);
  /** Fin de la visite ou « Passer » : la présentation ne revient plus. */
  const finish = useCallback(() => {
    setPhase('done');
    void markOnboardingSeen().catch(console.error);
  }, []);

  return { phase, active: phase === 'intro' || phase === 'tour', startTour, finish };
}
