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

/** Commande du manifest : ⌘⇧E (Ctrl+Shift+E), démarre puis enregistre, sans ouvrir le panel. */
export const RECORD_COMMAND = 'record-shortcut';

/**
 * Canal de messages propre au raccourci clavier (préfixe `shortcut:`), séparé de BgApi/ContentApi.
 * content → SW : hello (suis-je l'onglet enregistré ?), save, cancel. SW → content : toast.
 */
export type ShortcutRequest =
  { type: 'shortcut:hello' } | { type: 'shortcut:save' } | { type: 'shortcut:cancel' };
export interface ShortcutHello {
  /** Site de l'enregistrement si CET onglet est en cours d'enregistrement, sinon null. */
  recordingHost: string | null;
  /** Touche attribuée (ex. « ⇧⌘E »), vide si aucune. */
  hotkey: string;
}
export interface ShortcutToast {
  type: 'shortcut:toast';
  text: string;
  tone: 'ok' | 'warn';
}

/** Commande du manifest : ⌘⇧X (Ctrl+Shift+X), affiche ou ferme la palette des raccourcis du site. */
export const PALETTE_COMMAND = 'open-shortcuts';

/** SW → content : ouvre la palette si elle est fermée, la ferme sinon. */
export interface ShortcutPaletteToggle {
  type: 'shortcut:palette';
  /** Touches attribuées (ex. « ⇧⌘E », « ⇧⌘X »), vides si aucune. */
  hotkeys: { record: string; palette: string };
}

/**
 * Nouvelle sélection dans la palette après une touche (↑ ↓ avec bouclage, Début, Fin).
 * -1 si la liste est vide ; sélection inchangée pour une autre touche.
 */
export function stepIndex(index: number, key: string, count: number): number {
  if (count <= 0) return -1;
  if (index < 0 || index >= count) {
    // Aucune sélection : ↓/Début partent du haut, ↑/Fin du bas.
    return key === 'ArrowUp' || key === 'End' ? count - 1 : 0;
  }
  const current = index;
  switch (key) {
    case 'ArrowDown':
      return (current + 1) % count;
    case 'ArrowUp':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return current;
  }
}

/** Chemin lisible d'une URL (décodé, avec la requête et l'ancre), pour l'afficher sous le nom. */
export function shortcutPath(url: string): string {
  try {
    const u = new URL(url);
    const raw = u.pathname + u.search + u.hash;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw; // séquence % invalide
    }
  } catch {
    return url;
  }
}

export type HotkeyAction = 'start' | 'save' | 'refuse';

/** Que faire quand la touche est pressée sur cet onglet ? */
export function hotkeyAction(
  recording: Pick<ShortcutRecording, 'tabId'> | null,
  tabId: number,
  url: string,
): HotkeyAction {
  if (recording?.tabId === tabId) return 'save';
  return shortcutUrl(url) ? 'start' : 'refuse';
}

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
  if (!url) throw new Error('This page can’t be used as a shortcut.');
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
