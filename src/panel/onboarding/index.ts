// Surface publique du module de présentation (premier lancement). Seul point de contact : App.tsx.
import type { ActiveTab } from '../tab';

export { Onboarding } from './Onboarding';
export { useOnboarding } from './useOnboarding';

/**
 * Site fictif montré pendant la visite quand l'onglet actif n'est pas une page web. L'id est un
 * entier valide qu'aucun onglet ne porte : les appels à l'onglet échouent sans bruit (un id
 * négatif ferait lever `chrome.tabs.*` de façon synchrone et casserait le rendu).
 */
export const DEMO_TAB: ActiveTab = {
  id: 2_147_483_647,
  url: 'https://example.com/',
  host: 'example.com',
};
