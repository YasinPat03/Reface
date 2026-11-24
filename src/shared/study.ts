// Pré-étude (« carte du site ») : à l'ouverture du panel, l'IA étudie la page en arrière-plan
// et nomme ses composants, avant même la demande. Le résultat (des SÉLECTEURS vérifiés, jamais
// des index) est gardé 30 jours par site et par section, puis revérifié sur la page à chaque
// génération (`content/components.ts`), comme les composants des skills.
import { z } from 'zod';
import { agentStepSchemaFor, parseStep, type AgentStep } from './schema';
import { mentions } from './skillFormat';
import type { Probe } from './types';

export const STUDY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** `false` : pré-étude désactivée (Options). Absente : active. */
export const STUDY_ENABLED_KEY = 'preStudy:v1';
export const STUDY_PREFIX = 'study:';
export const MAX_STUDY_COMPONENTS = 16;

export const studyKey = (host: string, section: string) =>
  `${STUDY_PREFIX}${host}:${section}` as const;

export interface StudyComponent {
  name: string;
  aliases: string[];
  selectors: string[];
  all: boolean;
}

export interface SiteStudy {
  createdAt: string;
  pageKind: string;
  summary: string;
  components: StudyComponent[];
}

/** Composant tel que nommé par le LLM, avant que le content script le résolve en sélecteurs. */
export interface StudiedRegion {
  name: string;
  aliases: string[];
  regionIndex: number;
  scope: 'one' | 'all';
}

export function isFresh(study: SiteStudy | null | undefined, now: number): study is SiteStudy {
  if (!study?.createdAt || !study.components?.length) return false;
  const age = now - Date.parse(study.createdAt);
  return Number.isFinite(age) && age >= 0 && age < STUDY_TTL_MS;
}

/** Faut-il étudier cette page maintenant ? */
export function shouldStudy(state: {
  enabled: boolean;
  hasKey: boolean;
  sensitive: boolean;
  web: boolean;
  cached: SiteStudy | null | undefined;
  running: boolean;
  now: number;
}): boolean {
  return (
    state.enabled &&
    state.hasKey &&
    state.web &&
    !state.sensitive &&
    !state.running &&
    !isFresh(state.cached, state.now)
  );
}

/**
 * Composants de l'étude à vérifier sur la page (ceux que la demande cite sont marqués), sans
 * ceux qui doublent un composant du skill du site (mêmes sélecteurs).
 */
export function studyProbes(study: SiteStudy | null, prompt: string, skip: string[] = []): Probe[] {
  if (!study) return [];
  const known = new Set(skip);
  return study.components
    .filter((c) => !c.selectors.some((selector) => known.has(selector)))
    .map((c) => ({
      name: c.name,
      selectors: c.selectors,
      all: c.all,
      asked: [c.name, ...c.aliases].some((alias) => mentions(prompt, alias)),
    }));
}

const answerProperties = {
  pageKind: { type: 'string', description: '1-3 words, e.g. "video search results".' },
  summary: { type: 'string', description: 'One sentence describing the page layout.' },
  components: {
    type: 'array',
    description: '8 to 16 components of THIS page.',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'aliases', 'regionIndex', 'scope'],
      properties: {
        name: { type: 'string', description: '2-5 words, in English.' },
        aliases: {
          type: 'array',
          items: { type: 'string' },
          description:
            'What users may call it, in English AND French, lowercase, singular and plural, also by its look or position.',
        },
        regionIndex: {
          type: 'integer',
          description: '[#n] of ONE element (outline, components or tool result).',
        },
        scope: {
          type: 'string',
          enum: ['one', 'all'],
          description: '"all": one item of a repeated list (every item is meant); else "one".',
        },
      },
    },
  },
} as const;

export const studyJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pageKind', 'summary', 'components'],
  properties: answerProperties,
} as const;

/** Étape de la pré-étude quand le fournisseur refuse les outils natifs (outils en JSON). */
export const studyStepJsonSchema = agentStepSchemaFor(
  'study',
  { properties: answerProperties, required: ['pageKind', 'summary', 'components'] },
  'The complete study when you answer; null while you call tools.',
);

export function parseStudyStep(raw: unknown): AgentStep {
  return parseStep(raw, 'study', (r) => 'components' in r);
}

const studyAnswer = z.object({
  pageKind: z.string().max(80).default(''),
  summary: z.string().max(300).default(''),
  components: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        aliases: z.array(z.string().max(60)).max(20).default([]),
        regionIndex: z.number().int(),
        scope: z.enum(['one', 'all']).default('one'),
      }),
    )
    .max(40),
});

export function parseStudyAnswer(raw: unknown): {
  pageKind: string;
  summary: string;
  components: StudiedRegion[];
} {
  const parsed = studyAnswer.safeParse(raw);
  if (!parsed.success) throw new Error('The page study doesn’t match the expected format.');
  const seen = new Set<number>();
  return {
    pageKind: parsed.data.pageKind,
    summary: parsed.data.summary,
    components: parsed.data.components
      .filter((c) => c.regionIndex >= 0 && !seen.has(c.regionIndex) && seen.add(c.regionIndex))
      .slice(0, MAX_STUDY_COMPONENTS)
      .map((c) => ({
        name: c.name.trim(),
        aliases: [...new Set(c.aliases.map((a) => a.trim().toLowerCase()).filter(Boolean))],
        regionIndex: c.regionIndex,
        scope: c.scope,
      })),
  };
}
