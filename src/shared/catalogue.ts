import { sectionOf } from './section';
import { sameTheme } from './catalogueIdentity';
export { sameTheme } from './catalogueIdentity';
import { compileRule } from './compile';
import { z } from 'zod';
import { catalogueEntrySchema, publicEntry, type CatalogueEntry } from './catalogueSchema';
import { getSiteRules } from './storage';
import { persist } from './rules';
import type { SiteRules } from './types';

export const CATALOGUE_PREFIX = 'catalogue:entry:';
export const CATALOGUE_URL =
  import.meta.env.VITE_REFACE_CATALOGUE_URL ??
  'https://sfqrjerdqzfqxmhjmwel.supabase.co/functions/v1/reface-catalogue';
export const CATALOGUE_REQUIRES_CODE =
  !/^http:\/\/(?:127\.0\.0\.1|localhost):8892\/api\/catalogue$/.test(CATALOGUE_URL);

export async function getPrivateCatalogue(): Promise<CatalogueEntry[]> {
  const stored = await chrome.storage.local.get(null);
  return Object.entries(stored)
    .filter(([key]) => key.startsWith(CATALOGUE_PREFIX))
    .flatMap(([, value]) => {
      const parsed = catalogueEntrySchema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter(
      (entry, index, entries) => entries.findIndex((other) => sameTheme(other, entry)) === index,
    );
}

let privateWrite: Promise<unknown> = Promise.resolve();
export function savePrivateEntry(raw: unknown): Promise<CatalogueEntry> {
  const operation = privateWrite.catch(() => undefined).then(() => storePrivateEntry(raw));
  privateWrite = operation;
  return operation;
}
async function storePrivateEntry(raw: unknown): Promise<CatalogueEntry> {
  const entry = catalogueEntrySchema.parse(raw);
  const existing = (await getPrivateCatalogue()).find((saved) => sameTheme(saved, entry));
  if (existing) return existing;
  await chrome.storage.local.set({ [CATALOGUE_PREFIX + entry.id]: entry });
  return entry;
}

export function capturePage(
  site: SiteRules,
  pageUrl: string,
  title: string,
  description: string,
): CatalogueEntry {
  const url = new URL(pageUrl);
  if (url.hostname !== site.host || !['http:', 'https:'].includes(url.protocol))
    throw new Error('The page moved to a different site.');
  const rules = site.rules.filter(
    (rule) =>
      rule.enabled &&
      (rule.scope === 'page'
        ? rule.pagePath === url.pathname
        : !rule.section || rule.section === sectionOf(url.pathname)),
  );
  if (!rules.length) throw new Error('Keep a change on this page before creating a theme.');
  return publicEntry(
    catalogueEntrySchema.parse({
      format: 'reface/catalogue/v1',
      id: `c_${crypto.randomUUID()}`,
      title,
      description,
      host: url.hostname,
      pagePath: url.pathname,
      pageUrl: url.origin + url.pathname,
      createdAt: new Date().toISOString(),
      rules,
    }),
  );
}

export async function getPublicCatalogue(): Promise<CatalogueEntry[]> {
  const response = await fetch(CATALOGUE_URL, {
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('The public catalogue is unavailable right now.');
  return z
    .array(catalogueEntrySchema)
    .max(500)
    .parse(await response.json());
}

export async function publishEntry(
  entry: CatalogueEntry,
  title: string,
  description: string,
  publisherCode?: string,
): Promise<CatalogueEntry> {
  const publication = publicEntry(catalogueEntrySchema.parse({ ...entry, title, description }));
  let response: Response;
  try {
    response = await fetch(CATALOGUE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(CATALOGUE_REQUIRES_CODE && publisherCode
          ? { 'X-ReFace-Publish-Code': publisherCode.trim() }
          : {}),
      },
      body: JSON.stringify(publication),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new Error(
      'The public catalogue is unavailable. Your theme stays in your private collection.',
    );
  }
  if (response.status === 403) throw new Error('Publishing code missing, invalid or revoked.');
  if (response.status === 413) throw new Error('The theme is too large to be published.');
  if (response.status === 422) throw new Error('This page can’t be shared in the catalogue.');
  if (response.status === 429) throw new Error('Publishing limit reached. Try again later.');
  if (response.status === 409) throw new Error('This theme is already in the public catalogue.');
  if (!response.ok) throw new Error('Publishing failed. Try again in a moment.');
  return catalogueEntrySchema.parse(await response.json());
}

export function catalogueRuleId(entry: CatalogueEntry, index: number): string {
  return `r_cat_${entry.id.slice(2, 26)}_${index}`;
}

export function matchesPage(entry: CatalogueEntry, pageUrl: string): boolean {
  try {
    const url = new URL(pageUrl);
    return (
      url.hostname === entry.host &&
      url.pathname === entry.pagePath &&
      url.origin === new URL(entry.pageUrl).origin
    );
  } catch {
    return false;
  }
}

export async function applyCatalogueEntry(raw: unknown, pageUrl: string): Promise<void> {
  const entry = catalogueEntrySchema.parse(raw);
  if (!matchesPage(entry, pageUrl)) throw new Error('Open the page shown on this theme to use it.');
  const site = await getSiteRules(entry.host);
  const imported = [
    {
      ...entry.rules[0]!,
      id: catalogueRuleId(entry, 0),
      prompt: entry.title,
      title: entry.title,
      explanation: entry.description,
      ops: [],
      targets: {},
      css: entry.rules.map(compileRule).join('\n'),
      enabled: true,
      scope: 'page' as const,
      pagePath: entry.pagePath,
      urlPattern: entry.pageUrl,
      health: { lastOk: null, failures: 0, status: 'ok' as const },
    },
  ];
  const ids = new Set(entry.rules.map((_, index) => catalogueRuleId(entry, index)));
  await persist({
    host: site.host,
    rules: [...site.rules.filter((rule) => !ids.has(rule.id)), ...imported],
  });
}

export async function deletePrivateEntry(entry: CatalogueEntry): Promise<void> {
  const stored = await chrome.storage.local.get(null);
  const keys = Object.entries(stored)
    .filter(([key, value]) => {
      if (!key.startsWith(CATALOGUE_PREFIX)) return false;
      const parsed = catalogueEntrySchema.safeParse(value);
      return parsed.success && (parsed.data.id === entry.id || sameTheme(parsed.data, entry));
    })
    .map(([key]) => key);
  await chrome.storage.local.remove(keys);
}
