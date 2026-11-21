// Opérations de haut niveau sur les règles d'un site : toute écriture recompile css:<host>.
import { compileSite } from './compile';
import { getSiteRules, saveSiteRules } from './storage';
import type { Rule, SiteRules } from './types';

export async function persist(site: SiteRules): Promise<SiteRules> {
  await saveSiteRules(site, compileSite(site.rules));
  return site;
}

export async function addRule(host: string, rule: Rule): Promise<SiteRules> {
  const site = await getSiteRules(host);
  return persist({ ...site, rules: [...site.rules, rule] });
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
