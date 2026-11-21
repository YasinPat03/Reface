// Validation des règles importées (Export/Import JSON). Le CSS est de toute façon
// refiltré par le compilateur avant d'atteindre une page.
import { z } from 'zod';
import type { Rule, SiteRules } from './types';

const declarations = z.record(z.string().max(60), z.string().max(500));

const fingerprint = z.object({
  tag: z.string().max(60),
  id: z.string().max(200).nullable(),
  classes: z.array(z.string().max(60)).max(20),
  role: z.string().max(60).nullable(),
  ariaLabel: z.string().max(200).nullable(),
  textSample: z.string().max(200),
  childCount: z.number().int().min(0),
});

export const ruleSchema = z.object({
  id: z.string().regex(/^r_[\w-]{1,40}$/),
  kind: z.literal('restyle'),
  createdAt: z.string().max(40),
  prompt: z.string().max(2000),
  urlPattern: z.string().max(500),
  pagePath: z.string().max(2000).optional(),
  scope: z.enum(['page', 'site']).optional(),
  enabled: z.boolean(),
  ops: z
    .array(
      z.object({
        op: z.enum(['hide', 'style', 'theme']),
        target: z.string().max(20).optional(),
        css: declarations.optional(),
      }),
    )
    .max(20),
  targets: z.record(
    z.string().max(20),
    z.object({
      selectors: z.array(z.string().max(300)).max(5),
      fingerprint: fingerprint.optional(),
      minMatches: z.number().int().min(0),
    }),
  ),
  css: z.string().max(16_000),
  explanation: z.string().max(1000),
  intent: z.null(),
  health: z.object({
    lastOk: z.string().max(40).nullable(),
    failures: z.number().int().min(0),
    status: z.enum(['ok', 'suspect']),
  }),
});

const HOST = /^[a-z0-9.-]{1,253}$/i;

export const exportSchema = z.object({
  format: z.literal('browser-paint/v1'),
  exportedAt: z.string(),
  sites: z
    .array(z.object({ host: z.string().regex(HOST), rules: z.array(ruleSchema).max(200) }))
    .max(2000),
});

export type ExportFile = z.infer<typeof exportSchema>;

export function makeExport(sites: SiteRules[]): ExportFile {
  return { format: 'browser-paint/v1', exportedAt: new Date().toISOString(), sites };
}

export function parseExport(raw: unknown): SiteRules[] {
  const result = exportSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Fichier invalide (${issue?.path.join('.') || 'racine'} : ${issue?.message}).`);
  }
  return result.data.sites as { host: string; rules: Rule[] }[];
}
