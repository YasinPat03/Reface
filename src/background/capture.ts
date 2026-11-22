// Capture de l'onglet (preview appliquée) pour l'affinage visuel : le LLM voit son résultat.
// Permise par host_permissions <all_urls>. Jamais sur un site sensible.
import { sensitiveReason } from '../shared/sensitive';

/** Capture JPEG de la partie visible de l'onglet, en data URL ; null si impossible. */
export async function captureTab(tabId: number): Promise<string | null> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || sensitiveReason(tab.url)) return null;
  try {
    // captureVisibleTab photographie l'onglet ACTIF de la fenêtre (avec le side panel, c'est déjà
    // le cas ; en E2E, le panel est un autre onglet).
    if (!tab.active) {
      await chrome.tabs.update(tabId, { active: true });
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 70 });
  } catch {
    return null;
  }
}
