import { useEffect, useState } from 'react';

import { APPEARANCE_KEY } from './appearanceKey';

type Appearance = 'light' | 'dark';

/** Le panneau et les réglages partagent leur apparence, sans modifier les réglages API. */
export function useAppearance() {
  const [appearance, setAppearance] = useState<Appearance>('light');
  useEffect(() => {
    let alive = true;
    const apply = (value: unknown) => {
      if (!alive) return;
      const next = value === 'dark' ? 'dark' : 'light';
      document.documentElement.dataset.appearance = next;
      setAppearance(next);
    };
    void chrome.storage.local.get(APPEARANCE_KEY).then((data) => apply(data[APPEARANCE_KEY]));
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[APPEARANCE_KEY]) apply(changes[APPEARANCE_KEY].newValue);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);
  const toggleAppearance = () => {
    const next = appearance === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.appearance = next;
    setAppearance(next);
    void chrome.storage.local.set({ [APPEARANCE_KEY]: next });
  };
  return { appearance, toggleAppearance };
}
