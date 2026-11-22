// Les zones présentées, dans l'ordre. `target` est la valeur de l'attribut `data-tour`.

export interface TourStep {
  target: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    target: 'compare',
    title: 'Original / Modifié',
    body: 'Comparez la page d’origine et votre version d’un clic.',
  },
  {
    target: 'pause',
    title: 'Pause',
    body: 'Suspend toutes vos modifications sur ce site, sans les perdre.',
  },
  {
    target: 'tab-edit',
    title: 'Modifier',
    body: 'Décrivez un changement en mots simples : ReFace l’essaie sur la page avant que vous le gardiez.',
  },
  {
    target: 'pick',
    title: 'Pointer un élément',
    body: 'Montrez un élément de la page pour cibler votre demande, ou cachez-le en un clic.',
  },
  {
    target: 'prompt',
    title: 'Votre demande',
    body: 'Écrivez ici, par exemple « masquer les commentaires » ou « agrandir le texte ».',
  },
  {
    target: 'tab-rules',
    title: 'Modifications',
    body: 'Les modifications gardées sur ce site : activez, désactivez ou supprimez-les une par une.',
  },
  {
    target: 'tab-catalogue',
    title: 'Catalogue',
    body: 'Gardez vos thèmes de côté, ou essayez ceux partagés par la communauté.',
  },
  {
    target: 'tab-shortcuts',
    title: 'Raccourcis',
    body: 'Des raccourcis vers les pages enfouies du site : ⌘⇧E pour en enregistrer un, ⌘⇧X pour les ouvrir.',
  },
  {
    target: 'theme',
    title: 'Clair ou sombre',
    body: 'Changez l’apparence du panneau.',
  },
  {
    target: 'options',
    title: 'Options',
    body: 'Votre clé d’API, le fournisseur d’IA et les réglages d’accessibilité.',
  },
];

/** Durée d'une étape : trajet du curseur, frappe du texte, puis le temps de le lire. */
export function stepDuration(step: TourStep): number {
  return Math.max(3500, CURSOR_TRAVEL_MS + TEXT_DELAY_MS + step.body.length * TYPE_SPEED_MS + 1600);
}

export const CURSOR_TRAVEL_MS = 750;
export const TEXT_DELAY_MS = 300;
export const TYPE_SPEED_MS = 18;
