import { useEffect, useState } from 'react';
import { getSiteRules, isPaused, keys } from '../shared/storage';
import type { SiteRules } from '../shared/types';

/** Règles du site + état de pause, synchronisés en direct avec chrome.storage. */
export function useSite(host: string): { site: SiteRules; paused: boolean } {
  const [site, setSite] = useState<SiteRules>({ host, rules: [] });
  const [paused, setPausedState] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const [rules, p] = await Promise.all([getSiteRules(host), isPaused(host)]);
      if (alive) {
        setSite(rules);
        setPausedState(p);
      }
    };
    void refresh();
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && (keys.rules(host) in changes || keys.paused(host) in changes)) {
        void refresh();
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [host]);

  return { site, paused };
}
