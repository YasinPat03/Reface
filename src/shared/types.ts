// Modèles de données partagés. Voir PRD §4.

/** Ops supportées par le MVP. Le backlog ajoutera insertLink, move, resize. */
export type OpKind = 'hide' | 'style' | 'theme';

/** Déclarations CSS : propriété → valeur (ex. { display: 'none' }). */
export type CssDeclarations = Record<string, string>;

export interface Op {
  op: OpKind;
  /** Clé dans `targets`. Absente pour `theme`, qui vise la page entière. */
  target?: string;
  css?: CssDeclarations;
}

/** Empreinte d'un élément, pour le health check (et le self-heal en backlog). */
export interface Fingerprint {
  tag: string;
  id: string | null;
  classes: string[];
  role: string | null;
  ariaLabel: string | null;
  textSample: string;
  childCount: number;
}

/** Cible résolue par l'extension : sélecteurs robustes, du plus au moins stable. */
export interface Target {
  selectors: string[];
  fingerprint?: Fingerprint;
  minMatches: number;
}

export type HealthStatus = 'ok' | 'suspect';

export interface Rule {
  id: string;
  kind: 'restyle';
  createdAt: string;
  prompt: string;
  urlPattern: string;
  enabled: boolean;
  ops: Op[];
  targets: Record<string, Target>;
  /** CSS libre validé (échappatoire de la recette). */
  css: string;
  explanation: string;
  /** Réservé au backlog (préférences par catégorie). */
  intent: null;
  health: { lastOk: string | null; failures: number; status: HealthStatus };
}

export interface SiteRules {
  host: string;
  rules: Rule[];
}

/** Référence de cible renvoyée par le LLM : un index de région de la distillation. */
export interface RecipeTarget {
  regionIndex: number;
  selectorHints: string[];
}

/** Réponse brute du LLM (validée par Zod en phase 2). */
export interface Recipe {
  ops: Op[];
  targets: Record<string, RecipeTarget>;
  css: string;
  explanation: string;
}

export interface Settings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
};
