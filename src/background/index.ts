// Service worker : agent core. Aucun état en mémoire globale (le SW s'endort après ~30 s).
import { callContent, listen, type BgApi } from '../shared/messages';

const enablePanelOnClick = () =>
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onInstalled.addListener(enablePanelOnClick);
chrome.runtime.onStartup.addListener(enablePanelOnClick);

listen<BgApi>({
  async ping({ tabId }) {
    const tab = await chrome.tabs.get(tabId);
    const host = tab.url ? new URL(tab.url).hostname : '';
    try {
      await callContent(tabId, 'ping', {});
      return { host, content: 'ok' };
    } catch {
      return { host, content: 'unreachable' };
    }
  },
});
