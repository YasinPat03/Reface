// Schéma de la recette renvoyée par le LLM (PRD §4, §6).
// Format « fil » compatible avec le mode strict des structured outputs (pas d'objets ouverts),
// puis converti en Recipe interne après validation Zod.
import { z } from 'zod';
import type { CssDeclarations, Op, Recipe, RecipeTarget } from './types';

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

export const wireRecipe = z.object({
  ops: z.array(wireOp).max(20),
  targets: z.array(wireTarget).max(20),
  css: z.string().max(16_000),
  explanation: z.string().max(600),
});

export type WireRecipe = z.infer<typeof wireRecipe>;

/** JSON Schema envoyé au LLM (response_format json_schema, strict). */
export const recipeJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ops', 'targets', 'css', 'explanation'],
  properties: {
    ops: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'target', 'declarations'],
        properties: {
          op: { type: 'string', enum: ['hide', 'style', 'theme'] },
          target: { type: 'string', description: 'Key of a target, or "" for a page-wide theme.' },
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
    },
    targets: {
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
    },
    css: { type: 'string', description: 'Optional extra plain CSS. Empty string if not needed.' },
    explanation: { type: 'string' },
  },
} as const;

/** Valide la sortie brute du LLM et la convertit au format interne. Lève une erreur lisible. */
export function parseRecipe(raw: unknown): Recipe {
  const result = wireRecipe.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `La réponse de l’IA ne respecte pas le format attendu (${result.error.issues[0]?.message ?? 'invalide'}).`,
    );
  }
  const wire = result.data;
  const keys = new Set(wire.targets.map((t) => t.key));
  const ops: Op[] = wire.ops.map((op) => {
    if (op.target && !keys.has(op.target)) {
      throw new Error(`La réponse de l’IA référence une cible inconnue (${op.target}).`);
    }
    if (op.op !== 'theme' && !op.target) {
      throw new Error(`L’opération « ${op.op} » doit viser une cible.`);
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
  return { ops, targets, css: wire.css, explanation: wire.explanation };
}

/** Inverse de parseRecipe : pour renvoyer la preview en cours au LLM lors d'une itération. */
export function toWire(recipe: Recipe): WireRecipe {
  return {
    ops: recipe.ops.map((op) => ({
      op: op.op,
      target: op.target ?? '',
      declarations: Object.entries(op.css ?? {}).map(([property, value]) => ({ property, value })),
    })),
    targets: Object.entries(recipe.targets).map(([key, t]) => ({
      key,
      ...t,
      scope: t.scope ?? 'one',
    })),
    css: recipe.css,
    explanation: recipe.explanation,
  };
}
