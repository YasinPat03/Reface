// Service worker : agent core. Aucun état en mémoire globale (le SW s'endort après ~30 s).
import { callContent, listen, type BgApi } from '../shared/messages';
import { generate, keep, quickHide, refine } from './agent';
import { listModels } from './llm';
import { suggestAccessibility } from './accessibility';
import { onInstalledOnboarding } from '../shared/onboarding';
import './shortcutHotkey';

const enablePanelOnClick = () =>
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onInstalled.addListener(({ reason }) => {
  enablePanelOnClick();
  void onInstalledOnboarding(reason).catch(console.error);
});
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
  generate: ({ tabId, prompt, previous, pick }) => generate(tabId, prompt, previous, pick),
  refine: ({ tabId, draft }) => refine(tabId, draft),
  keep: ({ tabId, draft }) => keep(tabId, draft),
  async discard({ tabId }) {
    await callContent(tabId, 'clearPreview', {});
    return null;
  },
  quickHide: ({ tabId, pick }) => quickHide(tabId, pick),
  suggestAccessibility: ({ description }) => suggestAccessibility(description),
  async testConnection(settings) {
    const models = await listModels(settings);
    return { models, modelFound: models.includes(settings.model) };
  },
});
