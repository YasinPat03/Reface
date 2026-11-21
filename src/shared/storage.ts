// Disposition des clés dans chrome.storage.local. Voir PRD §4.
import { compilePages } from './compile';
import { DEFAULT_SETTINGS, type Settings, type SiteRules } from './types';

export const keys = {
  /** Règles complètes du site (source de vérité). */
  rules: (host: string) => `rules:${host}` as const,
  /** CSS précompilé, lu tel quel par l'injecteur au document_start. */
  css: (host: string) => `css:${host}` as const,
  pages: (host: string) => `page-css:${host}` as const,
  /** Présent et vrai : toutes les modifs sont suspendues sur ce site. */
  paused: (host: string) => `paused:${host}` as const,
  settings: 'settings',
} as const;

const local = () => chrome.storage.local;

export async function getSiteRules(host: string): Promise<SiteRules> {
  const key = keys.rules(host);
  const data = await local().get(key);
  return (data[key] as SiteRules | undefined) ?? { host, rules: [] };
}

export async function setSiteRules(site: SiteRules): Promise<void> {
  await local().set({ [keys.rules(site.host)]: site });
}

export async function setCompiledCss(host: string, css: string): Promise<void> {
  if (css) await local().set({ [keys.css(host)]: css });
  else await local().remove(keys.css(host));
}

export async function isPaused(host: string): Promise<boolean> {
  const key = keys.paused(host);
  const data = await local().get(key);
  return data[key] === true;
}

export async function setPaused(host: string, paused: boolean): Promise<void> {
  if (paused) await local().set({ [keys.paused(host)]: true });
  else await local().remove(keys.paused(host));
}

export async function getSettings(): Promise<Settings> {
  const data = await local().get(keys.settings);
  return { ...DEFAULT_SETTINGS, ...(data[keys.settings] as Partial<Settings> | undefined) };
}

export async function setSettings(settings: Settings): Promise<void> {
  await local().set({ [keys.settings]: settings });
}

/**
 * Écrit les règles ET le CSS précompilé en une seule opération,
 * pour que l'injecteur ne voie jamais un état incohérent.
 */
export async function saveSiteRules(site: SiteRules, compiledCss: string): Promise<void> {
  await local().set({
    [keys.rules(site.host)]: site,
    [keys.css(site.host)]: compiledCss,
    [keys.pages(site.host)]: compilePages(site.rules),
  });
}
