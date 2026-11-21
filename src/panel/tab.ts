import { useEffect, useState } from 'react';

export interface ActiveTab {
  id: number;
  url: string;
  host: string;
}

/** `?tabId=N` : ouvre le panel dans un onglet en visant un autre onglet (debug, tests E2E). */
const pinnedTabId = Number(new URLSearchParams(location.search).get('tabId')) || null;

export async function getActiveTab(): Promise<ActiveTab | null> {
  const [tab] = pinnedTabId
    ? [await chrome.tabs.get(pinnedTabId).catch(() => undefined)]
    : await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url) return null;
  let host = '';
  try {
    const url = new URL(tab.url);
    if (url.protocol === 'http:' || url.protocol === 'https:') host = url.hostname;
  } catch {
    /* URL non parsable */
  }
  return { id: tab.id, url: tab.url, host };
}

/** Onglet actif, mis à jour quand l'utilisateur change d'onglet ou navigue. */
export function useActiveTab(): ActiveTab | null {
  const [tab, setTab] = useState<ActiveTab | null>(null);
  useEffect(() => {
    const refresh = () => void getActiveTab().then(setTab);
    refresh();
    const onUpdated = (_id: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (info.url || info.status === 'complete') refresh();
    };
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.windows.onFocusChanged.addListener(refresh);
    return () => {
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.windows.onFocusChanged.removeListener(refresh);
    };
  }, []);
  return tab;
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
