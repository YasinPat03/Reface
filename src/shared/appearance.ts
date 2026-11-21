import { useEffect, useState } from 'react';

type Appearance = 'light' | 'dark';
const KEY = 'ui:appearance';

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
    void chrome.storage.local.get(KEY).then((data) => apply(data[KEY]));
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[KEY]) apply(changes[KEY].newValue);
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
    void chrome.storage.local.set({ [KEY]: next });
  };
  return { appearance, toggleAppearance };
}
