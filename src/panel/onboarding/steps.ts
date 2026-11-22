// Les zones présentées, dans l'ordre. `target` est la valeur de l'attribut `data-tour`.

export interface TourStep {
  target: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    target: 'compare',
    title: 'Original / Modified',
    body: 'Compare the original page with your version in one click.',
  },
  {
    target: 'pause',
    title: 'Pause',
    body: 'Pauses all your changes on this site, without losing them.',
  },
  {
    target: 'tab-edit',
    title: 'Edit',
    body: 'Describe a change in plain words: ReFace tries it on the page before you keep it.',
  },
  {
    target: 'pick',
    title: 'Pick an element',
    body: 'Point at an element of the page to target your request, or hide it in one click.',
  },
  {
    target: 'prompt',
    title: 'Your request',
    body: 'Type here, for example “hide the comments” or “make the text bigger”.',
  },
  {
    target: 'tab-rules',
    title: 'Changes',
    body: 'The changes kept on this site: turn them on, off or delete them one by one.',
  },
  {
    target: 'tab-catalogue',
    title: 'Catalogue',
    body: 'Set your themes aside, or try the ones shared by the community.',
  },
  {
    target: 'tab-shortcuts',
    title: 'Shortcuts',
    body: 'Shortcuts to the site’s buried pages: ⌘⇧E to record one, ⌘⇧X to open them.',
  },
  {
    target: 'theme',
    title: 'Light or dark',
    body: 'Change the panel’s appearance.',
  },
  {
    target: 'options',
    title: 'Options',
    body: 'Your API key, the AI provider and the accessibility settings.',
  },
];

/** Durée d'une étape : trajet du curseur, frappe du texte, puis le temps de le lire. */
export function stepDuration(step: TourStep): number {
  return Math.max(3500, CURSOR_TRAVEL_MS + TEXT_DELAY_MS + step.body.length * TYPE_SPEED_MS + 1600);
}

export const CURSOR_TRAVEL_MS = 750;
export const TEXT_DELAY_MS = 300;
export const TYPE_SPEED_MS = 18;
