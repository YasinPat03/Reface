import type { SiteContext } from './siteContext';
import type { ThemeTokens } from './theme';

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
  /** Prompt d'origine (itérations jointes par « → »), partagé par les changements d'un même prompt. */
  prompt: string;
  /** Libellé court de CE changement (un long prompt en produit plusieurs). Absent : afficher `prompt`. */
  title?: string;
  urlPattern: string;
  /** Chemin de la page où la règle a été créée : le health check ne vérifie que les pages du même gabarit. */
  pagePath?: string;
  /** Catalogue themes apply only to their saved page. Legacy rules remain site-wide. */
  scope?: 'page' | 'site';
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

/** Un changement distinct demandé par l'utilisateur (un prompt « X, Y et Z » en donne trois). */
export interface RecipeChange {
  title: string;
  ops: Op[];
  /** Clés propres à ce changement. */
  targets: Record<string, RecipeTarget>;
  css: string;
  /** Thème conçu par le LLM (jetons), compilé en CSS par l'extension. */
  theme?: ThemeTokens | null;
  /** Menu replié n (« [menu n] » de l'instantané) à montrer en barre horizontale ; 0 ou absent : aucun. */
  menuBar?: number;
}

/** Réponse brute du LLM (validée par Zod en phase 2). */
export interface Recipe {
  changes: RecipeChange[];
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

/**
 * Composant à chercher sur la page (skill de site, pré-étude) : le content script vérifie ses
 * sélecteurs sur la page vivante et ne montre au LLM que ceux qui visent vraiment quelque chose.
 */
export interface Probe {
  name: string;
  /** Sélecteurs alternatifs, du plus au moins sûr. */
  selectors: string[];
  /** Élément répété (cartes, lignes) : à viser en entier (« all similar »). */
  all: boolean;
  /** Cité dans la demande (alias reconnu) : affiché en premier et signalé au LLM. */
  asked: boolean;
}

/** Résultat de la distillation du DOM (PRD §5). */
export interface DistillResult {
  /**
   * Numéro de la distillation (compteur du content script) : un index de région n'est valable
   * que pour la distillation qui l'a produit (voir la garde de `preparePreview`).
   */
  distillId?: number;
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
  /** Surfaces, palette, listes répétées et rôles, avec des sélecteurs vérifiés (`content/design.ts`). */
  design?: string;
  /** Composants du skill de site trouvés sur la page, avec sélecteurs vérifiés et [#n] (`content/components.ts`). */
  components?: string;
  /** Nombre d'éléments visés par chaque sélecteur demandé dans `count` (règles déjà gardées). */
  probed?: Record<string, number>;
  /** Éléments visibles qui portent les mots de la demande (pré-recherche), avec leurs [#n]. */
  matches?: string;
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
  /** Changements résolus par l'extension : chacun deviendra une règle distincte au Keep. */
  changes: DraftChange[];
  explanation: string;
  /** CSS compilé des changements cochés, actuellement appliqué en preview. */
  previewCss: string;
  warnings: string[];
  /** Régressions de mise en page détectées après la preview (en anglais, pour le LLM). */
  layoutIssues?: string[];
  /**
   * Mise en page cassée (titres séparés de leurs infos, textes qui se chevauchent…), en français :
   * si le problème persiste après l'auto-correction, la preview est refusée avec cette explication.
   */
  broken?: string[];
  /** Version retenue après l'affinage visuel (le LLM a vu sa preview et l'a corrigée). */
  refined?: boolean;
  /** Défauts vus par le LLM sur la capture de la v1 (et corrigés par la v2). */
  review?: string[];
  /** Page distillée pour ce brouillon : l'affinage la réutilise au lieu de redistiller. */
  page?: DistillResult;
}

/** Changement résolu : sélecteurs robustes, CSS normalisé. */
export interface DraftChange {
  title: string;
  ops: Op[];
  targets: Record<string, Target>;
  css: string;
  /** Jetons du thème (révisables en itération) et leur CSS compilé, fusionné dans `css` au Keep. */
  theme?: ThemeTokens;
  themeCss?: string;
  /** Menu replié montré en barre (révisable en itération) et son CSS calculé, fusionné au Keep. */
  menuBar?: number;
  menuCss?: string;
  /** Coché dans la preview : seuls les changements cochés sont prévisualisés et enregistrés. */
  enabled: boolean;
  /** Prompt(s) qui ont produit CE changement (pas ceux des autres changements du brouillon). */
  prompt?: string;
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

/** Appel d'un outil d'examen de la page, exécuté par le content script (lecture seule). */
export type InvestigateCall =
  | {
      tool: 'find_elements';
      /** Mots de la page (texte, aria-label, alt…) ou sélecteurs CSS à tester. */
      queries: string[];
      /** Région [#n] dans laquelle chercher, -1 pour toute la page. */
      within: number;
    }
  | { tool: 'inspect_regions'; regions: number[]; depth: number };

/** Résultat d'un appel : texte pour le LLM, libellé court pour la progression du panel. */
export interface InvestigateResult {
  text: string;
  label: string;
}
