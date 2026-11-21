import { useEffect, useState } from 'react';
import {
  RECORD_COMMAND,
  getRecording,
  getShortcuts,
  shortcutKeys,
  stopRecording,
  type ShortcutRecording,
  type SiteShortcuts,
} from '../../shared/shortcuts';

/** Raccourcis du site, synchronisés en direct avec chrome.storage.local. */
export function useShortcuts(host: string): SiteShortcuts {
  const [site, setSite] = useState<SiteShortcuts>({ host, shortcuts: [] });

  useEffect(() => {
    let alive = true;
    const key = shortcutKeys.site(host);
    const refresh = async () => {
      const next = await getShortcuts(host);
      if (alive) setSite(next);
    };
    void refresh();
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && key in changes) void refresh();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [host]);

  return site.host === host ? site : { host, shortcuts: [] };
}

export function useShortcutCount(host: string): number {
  return useShortcuts(host).shortcuts.length;
}

/** Enregistrement en cours (chrome.storage.session), effacé si son onglet n'existe plus. */
export function useRecording(): ShortcutRecording | null {
  const [recording, setRecording] = useState<ShortcutRecording | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      let next = await getRecording();
      if (next && !(await chrome.tabs.get(next.tabId).then(Boolean, () => false))) {
        await stopRecording();
        next = null;
      }
      if (alive) setRecording(next);
    };
    void refresh();
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'session' && shortcutKeys.recording in changes) void refresh();
    };
    const onRemoved = (tabId: number) => {
      void getRecording().then((r) => (r?.tabId === tabId ? stopRecording() : undefined));
    };
    chrome.storage.onChanged.addListener(onChanged);
    chrome.tabs.onRemoved.addListener(onRemoved);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChanged);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    };
  }, []);

  return recording;
}

/** Touche attribuée au raccourci clavier (ex. « ⇧⌘E ») ; '' si aucune, null pendant le chargement. */
export function useHotkey(): string | null {
  const [hotkey, setHotkey] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void chrome.commands.getAll().then(
      (commands) =>
        alive && setHotkey(commands.find((c) => c.name === RECORD_COMMAND)?.shortcut ?? ''),
      () => null,
    );
    return () => {
      alive = false;
    };
  }, []);
  return hotkey;
}

/** URL et titre courants d'un onglet, mis à jour pendant la navigation. */
export function useTabPage(tabId: number): { url: string; title: string } {
  const [page, setPage] = useState({ tabId, url: '', title: '' });

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      void chrome.tabs.get(tabId).then(
        (tab) => alive && setPage({ tabId, url: tab.url ?? '', title: tab.title ?? '' }),
        () => null,
      );
    refresh();
    const onUpdated = (id: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (id === tabId && (info.url || info.title || info.status === 'complete')) refresh();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      alive = false;
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [tabId]);

  return page.tabId === tabId ? page : { url: '', title: '' };
}
