// Touches des raccourcis, sans ouvrir le panel :
// - ⌘⇧E (« record-shortcut ») : 1re pression, démarre l'enregistrement ; 2e, enregistre la page atteinte ;
// - ⌘⇧X (« open-shortcuts ») : affiche ou ferme la palette des raccourcis du site (content script).
// Module isolé, branché par un simple import dans index.ts. Il a son propre canal de messages
// (`shortcut:*`) et partage l'enregistrement en cours avec le panel (chrome.storage.session).
import {
  PALETTE_COMMAND,
  RECORD_COMMAND,
  addShortcut,
  getRecording,
  hotkeyAction,
  shortcutKeys,
  shortcutUrl,
  startRecording,
  stopRecording,
  type ShortcutHello,
  type ShortcutPaletteToggle,
  type ShortcutRecording,
  type ShortcutRequest,
  type ShortcutToast,
} from '../shared/shortcuts';

const BADGE_COLOR = '#dc2626';
const REQUESTS = new Set<unknown>(['shortcut:hello', 'shortcut:save', 'shortcut:cancel']);

// Le content script lit lui-même l'enregistrement en cours : sans enregistrement, il ne réveille
// jamais le SW. La session ne contient que { tabId, host, startUrl } ; les pages n'y ont pas accès.
chrome.storage.session
  .setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
  .catch(console.error);

async function setBadge(tabId: number, text: string): Promise<void> {
  try {
    if (text) await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
    await chrome.action.setBadgeText({ tabId, text });
  } catch {
    /* onglet fermé entre-temps */
  }
}

function flashRefused(tabId: number): void {
  void setBadge(tabId, '✕');
  setTimeout(() => void setBadge(tabId, ''), 2000);
}

function toast(tabId: number, text: string, tone: ShortcutToast['tone']): Promise<unknown> {
  const message: ShortcutToast = { type: 'shortcut:toast', text, tone };
  return chrome.tabs.sendMessage(tabId, message).catch(() => null);
}

async function hotkeyLabel(command: string): Promise<string> {
  const commands = await chrome.commands.getAll();
  return commands.find((c) => c.name === command)?.shortcut ?? '';
}

/** ⌘⇧X : le content script ouvre ou ferme la palette. Pas de content script : badge « ✕ ». */
async function togglePalette(tabId: number): Promise<void> {
  const message: ShortcutPaletteToggle = {
    type: 'shortcut:palette',
    hotkeys: {
      record: await hotkeyLabel(RECORD_COMMAND),
      palette: await hotkeyLabel(PALETTE_COMMAND),
    },
  };
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    flashRefused(tabId); // chrome://, Web Store, ou onglet ouvert avant le chargement de l'extension
  }
}

async function saveCurrentPage(recording: ShortcutRecording, tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) return;
  if (!shortcutUrl(tab.url ?? '')) return flashRefused(tab.id);
  const { added, shortcut } = await addShortcut(recording.host, tab.url ?? '', tab.title ?? '');
  if (!added) {
    await toast(tab.id, 'Ce raccourci existe déjà : naviguez vers une autre page.', 'warn');
    return;
  }
  await stopRecording();
  await toast(tab.id, `✓ Raccourci « ${shortcut.label} » enregistré`, 'ok');
}

/** Même logique pour la touche, les boutons de la pastille et les tests. */
async function onHotkey(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  const recording = await getRecording();
  const url = tab.url ?? '';
  switch (hotkeyAction(recording, tabId, url)) {
    case 'save':
      if (recording) await saveCurrentPage(recording, tab);
      return;
    case 'start':
      await startRecording({
        tabId,
        host: new URL(url).hostname,
        startUrl: url,
        startedAt: new Date().toISOString(),
      });
      return;
    case 'refuse':
      flashRefused(tabId);
  }
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (tab?.id === undefined) return;
  if (command === RECORD_COMMAND) void onHotkey(tab.id).catch(console.error);
  else if (command === PALETTE_COMMAND) void togglePalette(tab.id).catch(console.error);
});

async function handle(request: ShortcutRequest, tabId: number): Promise<ShortcutHello | null> {
  const recording = await getRecording();
  const mine = recording?.tabId === tabId ? recording : null;
  if (request.type === 'shortcut:hello') {
    // Réappliqué à chaque page chargée : le badge survit ainsi à la navigation.
    if (mine) await setBadge(tabId, 'REC');
    return { recordingHost: mine?.host ?? null, hotkey: await hotkeyLabel(RECORD_COMMAND) };
  }
  if (!mine) return null;
  if (request.type === 'shortcut:save') await saveCurrentPage(mine, await chrome.tabs.get(tabId));
  else await stopRecording();
  return null;
}

chrome.runtime.onMessage.addListener((message: { type?: unknown }, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!REQUESTS.has(message?.type) || tabId === undefined) return false;
  handle(message as ShortcutRequest, tabId).then(sendResponse, (error: unknown) => {
    console.error(error);
    sendResponse(null);
  });
  return true; // réponse asynchrone
});

// Badge « REC » sur l'onglet enregistré, quelle que soit l'origine du changement (touche, panel).
chrome.storage.onChanged.addListener((changes, area) => {
  const change = area === 'session' ? changes[shortcutKeys.recording] : undefined;
  if (!change) return;
  const before = change.oldValue as ShortcutRecording | undefined;
  const after = change.newValue as ShortcutRecording | undefined;
  if (before && before.tabId !== after?.tabId) void setBadge(before.tabId, '');
  if (after) void setBadge(after.tabId, 'REC');
});

// Pour les tests E2E : déclenche les touches sur un onglet (le SW n'est pas accessible aux pages ;
// les touches simulées par Playwright n'atteignent pas les commandes d'extension).
Object.assign(globalThis, { __bpShortcutHotkey: onHotkey, __bpShortcutPalette: togglePalette });
