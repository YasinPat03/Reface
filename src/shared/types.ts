import type { SiteContext } from './siteContext';

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
  /** Chemin de la page où la règle a été créée : le health check ne vérifie que les pages du même gabarit. */
  pagePath?: string;
  /** Section (type de page) où la règle s'applique, ex. « watch ». Absente ou null : tout le site. */
  section?: string | null;
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
  /** « all_similar » : la région est un exemplaire d'une liste répétée et la demande vise toute la liste. */
  scope?: 'one' | 'all_similar';
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

/** Résultat de la distillation du DOM (PRD §5). */
export interface DistillResult {
  url: string;
  title: string;
  host: string;
  /** Une ligne par région, indentée selon la profondeur. */
  regions: string;
  regionCount: number;
  /** Résumé typographique : balises présentes et styles calculés de base. */
  typography: string;
  /** Identité du site : nom, catégorie, métadonnées. */
  site: SiteContext;
  /** Inventaire des images/vidéos visibles, groupées avec un sélecteur vérifié. */
  media: string;
  /** Pour chaque sélecteur demandé dans `include`, l'index de région de l'élément (ou -1). */
  included: Record<string, number>;
}

/** Modification en preview, pas encore enregistrée. */
export interface Draft {
  host: string;
  /** Prompts successifs (itérations). */
  prompts: string[];
  /** Recette telle que renvoyée par le LLM (indices de région). */
  recipe: Recipe;
  /** Règle résolue par l'extension : sélecteurs robustes, CSS normalisé. */
  ops: Op[];
  targets: Record<string, Target>;
  css: string;
  explanation: string;
  /** CSS compilé, actuellement appliqué en preview. */
  previewCss: string;
  warnings: string[];
  /** Régressions de mise en page détectées après la preview (en anglais, pour le LLM). */
  layoutIssues?: string[];
}

/** Élément choisi avec le picker. */
export interface PickResult {
  /** Sélecteur unique principal. */
  selector: string;
  selectors: string[];
  /** Libellé lisible (tag#id · texte), affiché dans le panel. */
  label: string;
  fingerprint: Fingerprint;
}
