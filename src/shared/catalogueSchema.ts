import { z } from 'zod';
import { ruleSchema } from './ruleSchema.ts';

export const catalogueEntrySchema = z
  .object({
    format: z.literal('reface/catalogue/v1'),
    id: z.string().regex(/^c_[a-zA-Z0-9_-]{1,48}$/),
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(240),
    host: z.string().regex(/^[a-z0-9.-]{1,253}$/i),
    pagePath: z.string().min(1).max(2000).startsWith('/'),
    pageUrl: z.string().max(2400).url(),
    createdAt: z.string().datetime(),
    rules: z.array(ruleSchema).min(1).max(100),
  })
  .superRefine((entry, ctx) => {
    let url: URL;
    try {
      url = new URL(entry.pageUrl);
    } catch {
      ctx.addIssue({ code: 'custom', path: ['pageUrl'], message: 'Adresse de page invalide.' });
      return;
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.hostname !== entry.host ||
      url.pathname !== entry.pagePath ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['pageUrl'],
        message: 'La page ne correspond pas au site et au chemin du thème.',
      });
    }
  });

export type CatalogueEntry = z.infer<typeof catalogueEntrySchema>;

/** Publication carries the theme, never the original prompts or captured page text. */
export function publicEntry(entry: CatalogueEntry): CatalogueEntry {
  return catalogueEntrySchema.parse({
    ...entry,
    rules: entry.rules.map((rule) => ({
      ...rule,
      prompt: entry.title,
      explanation: entry.description,
      pagePath: entry.pagePath,
      scope: 'page',
      urlPattern: entry.pageUrl,
      targets: Object.fromEntries(
        Object.entries(rule.targets).map(([key, target]) => [
          key,
          {
            selectors: target.selectors,
            minMatches: target.minMatches,
          },
        ]),
      ),
    })),
  });
}
