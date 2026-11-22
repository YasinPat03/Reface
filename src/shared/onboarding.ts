// Présentation du premier lancement : une seule clé dans chrome.storage.local.
// Sans la clé, le panneau joue la présentation. Elle est écrite à la fin ou quand on passe.

export const ONBOARDING_KEY = 'onboarding:v1';

export interface OnboardingSeen {
  seenAt: string;
}

export async function isOnboardingSeen(): Promise<boolean> {
  const data = await chrome.storage.local.get(ONBOARDING_KEY);
  return data[ONBOARDING_KEY] !== undefined;
}

export async function markOnboardingSeen(now = new Date()): Promise<void> {
  const value: OnboardingSeen = { seenAt: now.toISOString() };
  await chrome.storage.local.set({ [ONBOARDING_KEY]: value });
}

/** « Revoir la présentation » : le panneau ouvert la relance aussitôt (storage.onChanged). */
export async function resetOnboarding(): Promise<void> {
  await chrome.storage.local.remove(ONBOARDING_KEY);
}

/**
 * `runtime.onInstalled` : une mise à jour veut dire que l'extension tournait déjà, donc la
 * présentation n'est pas montrée. Une installation neuve ne fait rien : la clé manque, et le
 * panneau la jouera à sa première ouverture.
 */
export async function onInstalledOnboarding(reason: string): Promise<void> {
  if (reason !== 'update') return;
  if (!(await isOnboardingSeen())) await markOnboardingSeen();
}
