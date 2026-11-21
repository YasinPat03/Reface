// Raccourcis vers des pages enfouies : module isolé (types, clés, logique pure, stockage).
// N'importe rien d'autre du projet, pour ne pas entrer en conflit avec le reste du panel.

export interface Shortcut {
  id: string;
  /** Nom affiché (titre de la page à l'enregistrement, renommable). */
  label: string;
  /** URL de destination, http(s) uniquement. */
  url: string;
  createdAt: string;
}

/** Raccourcis d'un site, rangés sous le host où l'enregistrement a commencé. */
export interface SiteShortcuts {
  host: string;
  shortcuts: Shortcut[];
}

/** Enregistrement en cours (un seul à la fois), dans chrome.storage.session. */
export interface ShortcutRecording {
  tabId: number;
  /** Site auquel le raccourci sera rattaché. */
  host: string;
  startUrl: string;
  startedAt: string;
}

export const shortcutKeys = {
  /** chrome.storage.local : raccourcis du site. */
  site: (host: string) => `shortcuts:${host}` as const,
  /** chrome.storage.session : enregistrement en cours. */
  recording: 'shortcutRecording',
} as const;

export const MAX_LABEL = 80;

// ---------- Logique pure (testée sans chrome) ----------

/** URL normalisée si elle peut servir de raccourci (http ou https), sinon null. */
export function shortcutUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_LABEL ? `${clean.slice(0, MAX_LABEL - 1).trimEnd()}…` : clean;
}

/** Nom par défaut : le titre de la page, ou à défaut son chemin (ou son host pour l'accueil). */
export function shortcutLabel(title: string, url: string): string {
  const fromTitle = clip(title);
  if (fromTitle) return fromTitle;
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname + u.search);
    return clip(path === '/' ? u.hostname : path);
  } catch {
    return clip(url);
  }
}

export function newShortcutId(): string {
  return `s_${crypto.randomUUID().slice(0, 8)}`;
}

/** Ajoute un raccourci, sauf si la même URL existe déjà (`added: false`, raccourci existant). */
export function withShortcut(
  site: SiteShortcuts,
  page: { url: string; title: string },
  id: string,
  now: string,
): { site: SiteShortcuts; added: boolean; shortcut: Shortcut } {
  const url = shortcutUrl(page.url);
  if (!url) throw new Error('Cette page ne peut pas servir de raccourci.');
  const existing = site.shortcuts.find((s) => s.url === url);
  if (existing) return { site, added: false, shortcut: existing };
  const shortcut: Shortcut = { id, label: shortcutLabel(page.title, url), url, createdAt: now };
  return { site: { ...site, shortcuts: [...site.shortcuts, shortcut] }, added: true, shortcut };
}

/** Renomme un raccourci ; un nom vide garde l'ancien. */
export function renamed(site: SiteShortcuts, id: string, label: string): SiteShortcuts {
  const next = clip(label);
  if (!next) return site;
  return {
    ...site,
    shortcuts: site.shortcuts.map((s) => (s.id === id ? { ...s, label: next } : s)),
  };
}

export function without(site: SiteShortcuts, id: string): SiteShortcuts {
  return { ...site, shortcuts: site.shortcuts.filter((s) => s.id !== id) };
}

// ---------- Stockage ----------

export async function getShortcuts(host: string): Promise<SiteShortcuts> {
  const key = shortcutKeys.site(host);
  const data = await chrome.storage.local.get(key);
  return (data[key] as SiteShortcuts | undefined) ?? { host, shortcuts: [] };
}

async function saveShortcuts(site: SiteShortcuts): Promise<void> {
  const key = shortcutKeys.site(site.host);
  if (site.shortcuts.length) await chrome.storage.local.set({ [key]: site });
  else await chrome.storage.local.remove(key);
}

export async function addShortcut(
  host: string,
  url: string,
  title: string,
): Promise<{ added: boolean; shortcut: Shortcut }> {
  const result = withShortcut(
    await getShortcuts(host),
    { url, title },
    newShortcutId(),
    new Date().toISOString(),
  );
  if (result.added) await saveShortcuts(result.site);
  return { added: result.added, shortcut: result.shortcut };
}

export async function renameShortcut(host: string, id: string, label: string): Promise<void> {
  await saveShortcuts(renamed(await getShortcuts(host), id, label));
}

export async function removeShortcut(host: string, id: string): Promise<void> {
  await saveShortcuts(without(await getShortcuts(host), id));
}

export async function getRecording(): Promise<ShortcutRecording | null> {
  const data = await chrome.storage.session.get(shortcutKeys.recording);
  return (data[shortcutKeys.recording] as ShortcutRecording | undefined) ?? null;
}

export async function startRecording(recording: ShortcutRecording): Promise<void> {
  await chrome.storage.session.set({ [shortcutKeys.recording]: recording });
}

export async function stopRecording(): Promise<void> {
  await chrome.storage.session.remove(shortcutKeys.recording);
}
