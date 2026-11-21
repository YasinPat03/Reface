// Opérations de haut niveau sur les règles d'un site : toute écriture recompile css:<host>.
import { compileSite } from './compile';
import { getSiteRules, saveSiteRules } from './storage';
import type { Rule, SiteRules } from './types';

export async function persist(site: SiteRules): Promise<SiteRules> {
  await saveSiteRules(site, compileSite(site.rules));
  return site;
}

export async function addRule(host: string, rule: Rule): Promise<SiteRules> {
  return addRules(host, [rule]);
}

/** Ajoute plusieurs règles en une seule écriture (l'injecteur ne voit jamais un état partiel). */
export async function addRules(host: string, rules: Rule[]): Promise<SiteRules> {
  const site = await getSiteRules(host);
  return persist({ ...site, rules: [...site.rules, ...rules] });
}

export async function updateRule(
  host: string,
  id: string,
  patch: Partial<Rule>,
): Promise<SiteRules> {
  const site = await getSiteRules(host);
  return persist({ ...site, rules: site.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
}

export async function removeRule(host: string, id: string): Promise<SiteRules> {
  const site = await getSiteRules(host);
  return persist({ ...site, rules: site.rules.filter((r) => r.id !== id) });
}

/** Recompile le CSS à partir des règles stockées (ex. après un import). */
export async function recompile(host: string): Promise<SiteRules> {
  return persist(await getSiteRules(host));
}

export function newRuleId(): string {
  return `r_${crypto.randomUUID().slice(0, 8)}`;
}

/** Toutes les règles de tous les sites (pour l'export). */
export async function getAllSites(): Promise<SiteRules[]> {
  const all = await chrome.storage.local.get(null);
  return Object.entries(all)
    .filter(([key]) => key.startsWith('rules:'))
    .map(([, value]) => value as SiteRules)
    .filter((site) => site.rules.length > 0);
}

/** Fusionne des sites importés : une règle de même id est remplacée. Retourne le nombre de règles. */
export async function importSites(sites: SiteRules[]): Promise<number> {
  let count = 0;
  for (const incoming of sites) {
    const site = await getSiteRules(incoming.host);
    const ids = new Set(incoming.rules.map((r) => r.id));
    await persist({
      host: incoming.host,
      rules: [...site.rules.filter((r) => !ids.has(r.id)), ...incoming.rules],
    });
    count += incoming.rules.length;
  }
  return count;
}
