// Pastille affichée dans la page pendant l'enregistrement d'un raccourci (lancé par ⌘⇧E ou le panel).
// Sans enregistrement en cours, une seule lecture de chrome.storage.session : le SW n'est pas réveillé.
// Shadow root ouvert (testable) ; les boutons n'agissent que sur un vrai clic (isTrusted).
import {
  shortcutKeys,
  type ShortcutHello,
  type ShortcutRequest,
  type ShortcutToast,
} from '../shared/shortcuts';

const TOAST_MS = 2500;

let recordingHost: string | null = null;
let hotkey = '';
let toast: { text: string; tone: ShortcutToast['tone'] } | null = null;
let toastTimer: number | undefined;
let pill: ReturnType<typeof createPill> | null = null;

const STYLE = `
  [hidden]{display:none !important}
  .pill{display:flex;align-items:center;gap:10px;max-width:min(460px,calc(100vw - 32px));
    padding:8px 8px 8px 12px;border-radius:12px;border:1px solid #ddd6fe;background:#fff;color:#18181b;
    font:13px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
    box-shadow:0 8px 28px rgba(0,0,0,.18)}
  .dot{flex:none;width:8px;height:8px;border-radius:50%;background:#dc2626;animation:pulse 1.2s ease-in-out infinite}
  @keyframes pulse{50%{opacity:.35}}
  .text{min-width:0;flex:1}
  .title{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .hint{display:block;color:#52525b;font-size:12px}
  kbd{font:inherit;font-size:11px;white-space:nowrap;padding:0 4px;border:1px solid #d4d4d8;border-radius:4px}
  button{all:unset;cursor:pointer;flex:none;border-radius:8px;padding:6px 10px;font:inherit;font-size:12px}
  .save{background:#7c3aed;color:#fff;font-weight:600}
  .save:hover{background:#6d28d9}
  .cancel{color:#71717a;padding:6px 8px}
  .cancel:hover{background:#f4f4f5;color:#18181b}
  button:focus-visible{outline:2px solid #7c3aed;outline-offset:2px}
  .pill[data-tone=ok]{border-color:#a7f3d0}
  .pill[data-tone=warn]{border-color:#fcd34d}
  @media (prefers-color-scheme: dark){
    .pill{background:#18181b;color:#fafafa;border-color:#4c1d95}
    .hint{color:#a1a1aa}
    kbd{border-color:#52525b}
    .cancel:hover{background:#27272a;color:#fafafa}
    .pill[data-tone=ok]{border-color:#065f46}
    .pill[data-tone=warn]{border-color:#92400e}
  }`;

function createPill() {
  const host = document.createElement('div');
  host.setAttribute('data-bp-shortcut', '');
  host.style.cssText = 'all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${STYLE}</style><div class="pill" role="status">
    <span class="dot"></span>
    <span class="text"><span class="title"></span><span class="hint"><span class="hint-text"></span><kbd></kbd></span></span>
    <button type="button" class="save">Enregistrer cette page</button>
    <button type="button" class="cancel" aria-label="Annuler l’enregistrement" title="Annuler">✕</button>
  </div>`;
  const $ = (selector: string) => root.querySelector(selector) as HTMLElement;
  const onClick = (button: HTMLElement, request: ShortcutRequest) =>
    button.addEventListener('click', (event) => {
      if (!event.isTrusted) return; // la page ne peut pas cliquer à la place de l'utilisateur
      void send(request);
    });
  onClick($('.save'), { type: 'shortcut:save' });
  onClick($('.cancel'), { type: 'shortcut:cancel' });
  // Les interactions avec la pastille ne concernent pas la page.
  for (const type of ['click', 'mousedown', 'pointerdown', 'keydown']) {
    host.addEventListener(type, (event) => event.stopPropagation());
  }
  return {
    host,
    box: $('.pill'),
    dot: $('.dot'),
    title: $('.title'),
    hint: $('.hint'),
    hintText: $('.hint-text'),
    key: $('kbd'),
    save: $('.save'),
    cancel: $('.cancel'),
  };
}

function render(): void {
  const state = toast ? 'toast' : recordingHost ? 'recording' : null;
  if (!state) {
    pill?.host.remove();
    pill = null;
    return;
  }
  pill ??= createPill();
  if (!pill.host.isConnected) document.documentElement.appendChild(pill.host);
  pill.host.dataset.state = state;
  const recording = state === 'recording';
  // textContent uniquement : jamais de HTML.
  pill.title.textContent = toast ? toast.text : `Raccourci pour ${recordingHost}`;
  pill.hintText.textContent = hotkey
    ? 'Naviguez jusqu’à la page voulue, puis appuyez sur '
    : 'Naviguez jusqu’à la page voulue, puis cliquez sur « Enregistrer cette page ».';
  pill.key.textContent = hotkey;
  pill.key.hidden = !hotkey;
  pill.hint.hidden = !recording;
  pill.dot.hidden = !recording;
  pill.save.hidden = !recording;
  pill.cancel.hidden = !recording;
  if (toast) pill.box.dataset.tone = toast.tone;
  else delete pill.box.dataset.tone;
}

async function send(request: ShortcutRequest): Promise<ShortcutHello | null> {
  try {
    return ((await chrome.runtime.sendMessage(request)) as ShortcutHello | null) ?? null;
  } catch {
    return null; // extension rechargée : ce content script est orphelin
  }
}

/** Relit l'enregistrement en cours et demande au SW s'il concerne cet onglet. */
async function refresh(): Promise<void> {
  // Accès à la session pas (encore) ouvert aux content scripts : comme s'il n'y avait rien.
  const present = await chrome.storage.session
    .get(shortcutKeys.recording)
    .then((data) => Boolean(data[shortcutKeys.recording]))
    .catch(() => false);
  const hello = present ? await send({ type: 'shortcut:hello' }) : null;
  recordingHost = hello?.recordingHost ?? null;
  hotkey = hello?.hotkey ?? '';
  render();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && shortcutKeys.recording in changes) void refresh();
});

chrome.runtime.onMessage.addListener((message: Partial<ShortcutToast> | undefined) => {
  if (message?.type !== 'shortcut:toast') return false;
  toast = { text: String(message.text ?? ''), tone: message.tone === 'warn' ? 'warn' : 'ok' };
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast = null;
    render();
  }, TOAST_MS);
  render();
  return false;
});

// Page restaurée depuis le cache avant/arrière : l'état a pu changer entre-temps.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) void refresh();
});

void refresh();
