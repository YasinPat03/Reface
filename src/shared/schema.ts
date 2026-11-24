// Schéma de la recette renvoyée par le LLM (PRD §4, §6).
// Format « fil » compatible avec le mode strict des structured outputs (pas d'objets ouverts),
// puis converti en Recipe interne après validation Zod.
import { z } from 'zod';
import type { ThemeRole, ThemeTokens } from './theme';
import type { CssDeclarations, Op, Recipe, RecipeChange, RecipeTarget } from './types';

const declaration = z.object({
  property: z.string().max(60),
  value: z.string().max(500),
});

const wireOp = z.object({
  op: z.enum(['hide', 'style', 'theme']),
  /** Clé d'une cible, ou chaîne vide (theme sur la page entière). */
  target: z.string().max(20),
  declarations: z.array(declaration).max(40),
});

const wireTarget = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,20}$/i),
  /** Index de région de la distillation, ou -1 si seules les suggestions de sélecteur servent. */
  regionIndex: z.number().int().min(-1).max(10_000),
  selectorHints: z.array(z.string().max(300)).max(5),
  scope: z.enum(['one', 'all_similar']).default('one'),
});

const THEME_ROLES = [
  'page',
  'header',
  'footer',
  'surface',
  'item',
  'title',
  'meta',
  'link',
  'heading',
  'input',
] as const satisfies readonly ThemeRole[];
const DENSITIES = ['compact', 'comfortable', 'airy'] as const;
const CARD_SHAPES = ['auto', 'square', 'landscape'] as const;
const PALETTE_KEYS = [
  'background',
  'surface',
  'text',
  'muted',
  'accent',
  'header',
  'onHeader',
  'border',
] as const;

/** Thème conçu par le LLM (jetons libres) : compilé en CSS par l'extension (`shared/theme.ts`). */
const wireTheme = z.object({
  inspiredBy: z.string().max(80),
  palette: z.object(
    Object.fromEntries(PALETTE_KEYS.map((k) => [k, z.string().max(40)])) as Record<
      (typeof PALETTE_KEYS)[number],
      z.ZodString
    >,
  ),
  typography: z.object({
    fontFamily: z.string().max(200),
    baseSize: z.number(),
    scale: z.number(),
    titleWeight: z.number(),
  }),
  shape: z.object({ radius: z.number(), shadow: z.string().max(200) }),
  layout: z.object({
    cards: z.boolean(),
    density: z.enum(DENSITIES),
    maxWidth: z.number(),
    dividers: z.boolean(),
    columns: z.number().default(1),
    cardShape: z.enum(CARD_SHAPES).default('auto'),
  }),
  roleStyles: z
    .array(z.object({ role: z.enum(THEME_ROLES), declarations: z.array(declaration).max(20) }))
    .max(12),
});

/** Un changement distinct : ses cibles sont propres (clés t1, t2… réutilisables d'un changement à l'autre). */
const wireChange = z.object({
  title: z.string().max(80),
  ops: z.array(wireOp).max(20),
  targets: z.array(wireTarget).max(20),
  css: z.string().max(16_000),
  theme: wireTheme.nullable().optional(),
  /** Menu replié à montrer en barre (« [menu n] » de l'instantané), 0 = aucun. */
  menuBar: z.number().int().min(0).max(10).default(0),
});

export const wireRecipe = z.object({
  /** Ce que la demande vise sur cette page, écrit AVANT les changements (le modèle répond sans raisonnement). */
  understanding: z.string().max(600).optional(),
  changes: z.array(wireChange).max(12),
  explanation: z.string().max(600),
});

/** Ancien format, à un seul changement : encore accepté (modèles qui ignorent le schéma, tests). */
const legacyRecipe = wireChange.omit({ title: true }).extend({ explanation: z.string().max(600) });

export type WireRecipe = z.infer<typeof wireRecipe>;
type WireChange = z.infer<typeof wireChange>;

const opsSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['op', 'target', 'declarations'],
    properties: {
      op: { type: 'string', enum: ['hide', 'style', 'theme'] },
      target: {
        type: 'string',
        description: 'Key of a target of this change, or "" for a page-wide theme.',
      },
      declarations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['property', 'value'],
          properties: { property: { type: 'string' }, value: { type: 'string' } },
        },
      },
    },
  },
} as const;

const targetsSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['key', 'regionIndex', 'selectorHints', 'scope'],
    properties: {
      key: { type: 'string', description: 'Short key such as t1.' },
      regionIndex: { type: 'integer', description: 'Index [#n] of the region, or -1.' },
      selectorHints: { type: 'array', items: { type: 'string' } },
      scope: {
        type: 'string',
        enum: ['one', 'all_similar'],
        description:
          '"all_similar" when the region is one item of a repeated list (outline similar=×N) and the request is about all those items; "one" for this specific element.',
      },
    },
  },
} as const;

const declarationsSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['property', 'value'],
    properties: { property: { type: 'string' }, value: { type: 'string' } },
  },
} as const;

const object = <P extends Record<string, unknown>>(properties: P, description?: string) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
  ...(description ? { description } : {}),
});

const themeSchema = {
  anyOf: [
    { type: 'null' },
    object(
      {
        inspiredBy: {
          type: 'string',
          description:
            'Design reference(s) this theme draws from (e.g. "Linear + Stripe"), or "" for an original design.',
        },
        palette: object(
          Object.fromEntries(
            PALETTE_KEYS.map((k) => [
              k,
              { type: 'string', description: 'Hex color, e.g. #1d1d1f.' },
            ]),
          ),
          'Your own palette for this request and site. background = behind cards, surface = content/cards, muted = secondary text, header/onHeader = top bar and its text.',
        ),
        typography: object({
          fontFamily: { type: 'string', description: 'System font stack only (no web fonts).' },
          baseSize: { type: 'number', description: 'Body size in px (12-22).' },
          scale: { type: 'number', description: 'Title / body ratio (1.1-1.6).' },
          titleWeight: { type: 'number', description: '400-800.' },
        }),
        shape: object({
          radius: { type: 'number', description: 'One radius in px, reused everywhere.' },
          shadow: { type: 'string', description: 'CSS box-shadow, or "none".' },
        }),
        layout: object({
          cards: { type: 'boolean', description: 'Each list item becomes a card.' },
          density: { type: 'string', enum: DENSITIES },
          maxWidth: { type: 'number', description: 'Max content width in px, 0 to keep.' },
          dividers: {
            type: 'boolean',
            description: 'Hairline rules between list items (without cards).',
          },
          columns: {
            type: 'number',
            description:
              'Items per row: 1 = vertical list, 2-4 = grid of cards ("3 per row"). The extension builds the grid and keeps each item (with its sibling rows) in one card.',
          },
          cardShape: {
            type: 'string',
            enum: CARD_SHAPES,
            description: 'Card proportions in a grid: square, landscape, or auto (content height).',
          },
        }),
        roleStyles: {
          type: 'array',
          description:
            'Optional creative extras per role beyond the tokens (gradients, borders, letter-spacing, text-transform…). color and font-size are owned by the tokens and ignored here.',
          items: object({
            role: { type: 'string', enum: THEME_ROLES },
            declarations: declarationsSchema,
          }),
        },
      },
      'Whole-page look designed by you (dark mode, modern, minimal, "like X", colors of the whole site…). The extension applies it to every surface, the top bar, list items, titles and metadata with guaranteed hierarchy and contrast. null for targeted edits.',
    ),
  ],
} as const;

/** JSON Schema envoyé au LLM (response_format json_schema, strict). */
export const recipeJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['understanding', 'changes', 'explanation'],
  properties: {
    understanding: {
      type: 'string',
      description:
        'Written first, one short sentence: what the user means on THIS page and which element(s) you will change, with their [#n] or verified selector (or what you could not find).',
    },
    changes: {
      type: 'array',
      description:
        'One entry per distinct change the user asked for. "hide X, enlarge Y and make Z red" = 3 changes. The user can toggle each change on/off separately.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'ops', 'targets', 'css', 'theme', 'menuBar'],
        properties: {
          title: {
            type: 'string',
            description:
              'Short label of this change, 2-6 words, in the language of the user request.',
          },
          ops: opsSchema,
          targets: targetsSchema,
          css: {
            type: 'string',
            description:
              'Optional extra plain CSS for THIS change only. Empty string if not needed.',
          },
          theme: themeSchema,
          menuBar: {
            type: 'integer',
            description:
              'n to show the collapsed menu [menu n] of the design snapshot as a permanent horizontal bar (navbar); the extension builds and verifies that layout. 0 otherwise.',
          },
        },
      },
    },
    explanation: { type: 'string' },
  },
} as const;

/**
 * Schéma de l'affinage visuel : la CRITIQUE d'abord (les défauts vus sur la capture, et si c'est
 * propre), puis la recette. Les sorties structurées suivent l'ordre du schéma : le modèle regarde
 * vraiment la capture avant de décider, au lieu de recopier sa recette.
 */
export const refineJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['review', 'changes', 'explanation'],
  properties: {
    review: {
      type: 'object',
      additionalProperties: false,
      required: ['defects', 'clean'],
      properties: {
        defects: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Visible defects in the screenshot that matter for the request or for a clean design (short, in the language of the user request). Empty if none.',
        },
        clean: {
          type: 'boolean',
          description: 'true only if the result is faithful to the request and visually clean.',
        },
      },
    },
    changes: recipeJsonSchema.properties.changes,
    explanation: recipeJsonSchema.properties.explanation,
  },
} as const;

/** Noms des outils d'examen, aussi utilisables « en JSON » (fournisseurs sans outils natifs). */
export const AGENT_TOOL_NAMES = ['find_elements', 'inspect_regions', 'load_skill'] as const;

/** Un appel d'outil écrit dans la réponse JSON : tous les champs, ceux d'un autre outil vides. */
const stepCallSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'queries', 'within', 'regions', 'depth', 'skill'],
  properties: {
    name: { type: 'string', enum: [...AGENT_TOOL_NAMES] },
    queries: {
      type: 'array',
      items: { type: 'string' },
      description: 'find_elements: 1-4 queries in the page words, or selectors. [] otherwise.',
    },
    within: { type: 'integer', description: 'find_elements: region [#n] or -1.' },
    regions: {
      type: 'array',
      items: { type: 'integer' },
      description: 'inspect_regions: 1-3 region indexes. [] otherwise.',
    },
    depth: { type: 'integer', description: 'inspect_regions: 1 to 3.' },
    skill: { type: 'string', description: 'load_skill: guide name. "" otherwise.' },
  },
} as const;

/**
 * Une étape de l'agent quand le fournisseur refuse les outils natifs (ex. modèles à raisonnement
 * sur /chat/completions) : les appels d'outils passent dans la réponse structurée elle-même.
 * Soit `tool_calls` non vide et la réponse (`key`) à null, soit `tool_calls` vide et la réponse.
 */
export function agentStepSchemaFor(
  key: string,
  answer: { properties: Record<string, unknown>; required: readonly string[] },
  description: string,
) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['understanding', 'tool_calls', key],
    properties: {
      understanding: recipeJsonSchema.properties.understanding,
      tool_calls: {
        type: 'array',
        description:
          'Tools to run before answering (their results come back in the next message). [] when you answer.',
        items: stepCallSchema,
      },
      [key]: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            additionalProperties: false,
            required: [...answer.required],
            properties: answer.properties,
          },
        ],
        description,
      },
    },
  } as const;
}

export const agentStepJsonSchema = agentStepSchemaFor(
  'recipe',
  {
    properties: {
      changes: recipeJsonSchema.properties.changes,
      explanation: recipeJsonSchema.properties.explanation,
    },
    required: ['changes', 'explanation'],
  },
  'The complete recipe when you answer; null while you call tools.',
);

const stepCall = z.object({
  name: z.enum(AGENT_TOOL_NAMES),
  queries: z.array(z.string()).default([]),
  within: z.number().int().default(-1),
  regions: z.array(z.number().int()).default([]),
  depth: z.number().int().default(1),
  skill: z.string().default(''),
});

export type AgentStepCall = z.infer<typeof stepCall>;
export type AgentStep =
  | { kind: 'answer'; value: unknown }
  | { kind: 'tools'; calls: AgentStepCall[] };

/**
 * Lit une étape : la réponse finale (`key`), ou les outils demandés. Une réponse nue (sans
 * enveloppe, reconnue par `bare`) est acceptée comme réponse finale.
 */
export function parseStep(raw: unknown, key: string, bare: (raw: object) => boolean): AgentStep {
  if (raw && typeof raw === 'object' && bare(raw)) return { kind: 'answer', value: raw };
  const step = z
    .object({
      understanding: z.string().max(600).optional(),
      tool_calls: z.array(stepCall).max(6).default([]),
    })
    .safeParse(raw);
  if (!step.success) throw new Error('The AI response doesn’t match the expected format.');
  const answer = (raw as Record<string, unknown>)[key];
  if (answer && typeof answer === 'object')
    return { kind: 'answer', value: { understanding: step.data.understanding, ...answer } };
  if (step.data.tool_calls.length) return { kind: 'tools', calls: step.data.tool_calls };
  throw new Error('The AI response doesn’t match the expected format (no recipe).');
}

export function parseAgentStep(raw: unknown): AgentStep {
  return parseStep(raw, 'recipe', (r) => 'changes' in r);
}

/** Critique de l'affinage visuel (le reste de la réponse est une recette normale). */
export function parseReview(raw: unknown): { defects: string[]; clean: boolean } {
  const review = (raw as { review?: { defects?: unknown; clean?: unknown } } | null)?.review;
  const defects = Array.isArray(review?.defects)
    ? review.defects.filter((d): d is string => typeof d === 'string').map((d) => d.slice(0, 160))
    : [];
  return { defects: defects.slice(0, 6), clean: review?.clean === true };
}

function parseChange(wire: WireChange, index: number): RecipeChange {
  const keys = new Set(wire.targets.map((t) => t.key));
  const ops: Op[] = wire.ops.map((op) => {
    if (op.target && !keys.has(op.target)) {
      throw new Error(`The AI response references an unknown target (${op.target}).`);
    }
    if (op.op !== 'theme' && !op.target) {
      throw new Error(`The "${op.op}" operation must target an element.`);
    }
    const css: CssDeclarations = Object.fromEntries(
      op.declarations.map((d) => [d.property, d.value]),
    );
    return {
      op: op.op,
      ...(op.target ? { target: op.target } : {}),
      ...(op.declarations.length ? { css } : {}),
    };
  });
  const targets: Record<string, RecipeTarget> = Object.fromEntries(
    wire.targets.map((t) => [
      t.key,
      { regionIndex: t.regionIndex, selectorHints: t.selectorHints, scope: t.scope },
    ]),
  );
  const theme: ThemeTokens | null = wire.theme
    ? {
        ...wire.theme,
        roleStyles: wire.theme.roleStyles.map((style) => ({
          role: style.role,
          declarations: Object.fromEntries(style.declarations.map((d) => [d.property, d.value])),
        })),
      }
    : null;
  return {
    title: wire.title.trim() || `Change ${index + 1}`,
    ops,
    targets,
    css: wire.css,
    ...(theme ? { theme } : {}),
    ...(wire.menuBar ? { menuBar: wire.menuBar } : {}),
  };
}

/** Valide la sortie brute du LLM et la convertit au format interne. Lève une erreur lisible. */
/** Clé de cible conforme (t1, titre_principal…) : le LLM écrit parfois « titre-principal ». */
function cleanKey(key: unknown): unknown {
  return typeof key === 'string' ? key.replace(/[^a-z0-9_]/gi, '_').slice(0, 20) || 't' : key;
}

/**
 * Normalise les clés de cible (et les références des ops) avant validation, plutôt que de
 * rejeter toute la réponse pour un tiret. Le reste du format est validé strictement par Zod.
 */
function normalizeKeys(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const fix = (change: unknown) => {
    if (!change || typeof change !== 'object') return change;
    const c = change as { ops?: unknown; targets?: unknown };
    return {
      ...c,
      ...(Array.isArray(c.targets)
        ? {
            targets: c.targets.map((t) =>
              t && typeof t === 'object'
                ? { ...t, key: cleanKey((t as { key?: unknown }).key) }
                : t,
            ),
          }
        : {}),
      ...(Array.isArray(c.ops)
        ? {
            ops: c.ops.map((o) => {
              if (!o || typeof o !== 'object') return o;
              const target = (o as { target?: unknown }).target;
              return { ...o, target: target === '' ? '' : cleanKey(target) };
            }),
          }
        : {}),
    };
  };
  const r = raw as { changes?: unknown };
  return Array.isArray(r.changes) ? { ...r, changes: r.changes.map(fix) } : fix(raw);
}

export function parseRecipe(input: unknown): Recipe {
  const raw = normalizeKeys(input);
  const result = wireRecipe.safeParse(raw);
  if (result.success) {
    const changes = result.data.changes
      .map(parseChange)
      .filter((c) => c.ops.length || c.css.trim() || c.theme || c.menuBar);
    return { changes, explanation: result.data.explanation };
  }
  const legacy = legacyRecipe.safeParse(raw);
  if (legacy.success) {
    const { explanation, ...change } = legacy.data;
    const parsed = parseChange({ ...change, title: explanation.slice(0, 80) }, 0);
    return { changes: parsed.ops.length || parsed.css.trim() ? [parsed] : [], explanation };
  }
  throw new Error(
    `The AI response doesn’t match the expected format (${result.error.issues[0]?.message ?? 'invalid'}).`,
  );
}

/** Inverse de parseRecipe : pour renvoyer la preview en cours au LLM lors d'une itération. */
export function toWire(recipe: Recipe): WireRecipe {
  return {
    changes: recipe.changes.map((change) => ({
      title: change.title,
      ops: change.ops.map((op) => ({
        op: op.op,
        target: op.target ?? '',
        declarations: Object.entries(op.css ?? {}).map(([property, value]) => ({
          property,
          value,
        })),
      })),
      targets: Object.entries(change.targets).map(([key, t]) => ({
        key,
        ...t,
        scope: t.scope ?? 'one',
      })),
      css: change.css,
      theme: change.theme
        ? {
            ...change.theme,
            roleStyles: change.theme.roleStyles.map((style) => ({
              role: style.role,
              declarations: Object.entries(style.declarations).map(([property, value]) => ({
                property,
                value,
              })),
            })),
          }
        : null,
      menuBar: change.menuBar ?? 0,
    })),
    explanation: recipe.explanation,
  };
}
