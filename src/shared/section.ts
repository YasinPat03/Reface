// « Section » d'une page = son type, d'après le 1er segment du chemin :
// /watch → « watch », /results → « results », /wiki/Golden_ratio → « wiki », / → « home ».
// Une règle s'applique par défaut à sa section (les pages du même type), ou à tout le site.

/** Clé du CSS commun à tout le site dans css:<host>. */
export const SITE_WIDE = '*';

export function sectionOf(pathname: string): string {
  const first = pathname.split('/').find(Boolean) ?? '';
  const clean = first
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
  return clean || 'home';
}

/** CSS précompilé par section, tel que stocké dans css:<host>. */
export type CompiledCss = Record<string, string>;

/** Lit css:<host> : objet par section, ou ancienne chaîne unique (= tout le site). */
export function readCompiled(value: unknown): CompiledCss {
  if (typeof value === 'string') return value ? { [SITE_WIDE]: value } : {};
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  }
  return {};
}

/** CSS à appliquer sur une page : commun au site + propre à sa section. */
export function cssForSection(compiled: CompiledCss, section: string): string {
  return [compiled[SITE_WIDE], compiled[section]].filter(Boolean).join('\n');
}
