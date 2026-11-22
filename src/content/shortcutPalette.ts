// Palette ⌘⇧X : la liste des raccourcis du site, au centre de la page.
// ↑ ↓ (en boucle), Début, Fin ; Entrée ou clic : ouvrir ; avec ⌘/Ctrl : nouvel onglet.
// Échap, clic à côté ou ⌘⇧X : fermer. Un <dialog> modal la place au-dessus de tout le site (top layer).
// Shadow root ouvert (testable) ; seuls les événements isTrusted comptent ; rien ne remonte au site.
import { bindShortcutAppearance, shortcutAppearance } from './shortcutAppearance';
import {
  shortcutKeys,
  shortcutPath,
  shortcutUrl,
  stepIndex,
  type Shortcut,
  type ShortcutPaletteToggle,
  type SiteShortcuts,
} from '../shared/shortcuts';

const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);
const ISOLATED_EVENTS = [
  'keydown',
  'keyup',
  'keypress',
  'click',
  'auxclick',
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup',
];
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);

const STYLE = `
  ${shortcutAppearance}
  dialog{box-sizing:border-box;padding:0;margin:12vh auto auto;width:min(520px,calc(100vw - 32px));
    max-height:min(70vh,560px);border:1px solid var(--line);border-radius:4px;
    background:var(--surface);color:var(--ink);overflow:hidden;
    box-shadow:0 20px 48px rgb(0 0 0 / .28);font:14px/1.5 var(--sans)}
  dialog[open]{display:flex;flex-direction:column}
  dialog:focus,dialog:focus-visible{outline:none}
  dialog::backdrop{background:rgb(14 18 24 / .48)}
  header{display:flex;align-items:baseline;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line)}
  .title{font-weight:600;flex:none}
  .site{color:var(--muted);font:11px/1.5 var(--mono);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  ul{list-style:none;margin:0;padding:6px 16px;overflow:auto;flex:1;min-height:0;outline:none}
  li{display:flex;flex-direction:column;gap:2px;padding:9px 10px;border-left:2px solid transparent;
    border-bottom:1px solid var(--line);cursor:pointer}
  li:last-child{border-bottom-color:transparent}
  li[aria-selected=true]{background:var(--accent-soft);border-left-color:var(--accent);color:var(--ink)}
  .label{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .path{font:11px/1.4 var(--mono);color:var(--muted);
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .empty{margin:0;padding:18px 16px;color:var(--muted)}
  footer{display:flex;flex-wrap:wrap;gap:6px 14px;padding:10px 16px;border-top:1px solid var(--line);
    color:var(--muted);font-size:11px}
`;

type Hotkeys = ShortcutPaletteToggle['hotkeys'];

let current: { close: () => void } | null = null;
let opening = false;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

async function readShortcuts(host: string): Promise<Shortcut[]> {
  const key = shortcutKeys.site(host);
  try {
    const data = await chrome.storage.local.get(key);
    return (data[key] as SiteShortcuts | undefined)?.shortcuts ?? [];
  } catch {
    return []; // extension rechargée : ce content script est orphelin
  }
}

/** Petit texte où les éléments `[touche]` deviennent des <kbd> (textContent uniquement). */
function hint(...parts: (string | [string])[]): HTMLElement {
  const span = document.createElement('span');
  for (const part of parts) {
    if (typeof part === 'string') {
      span.append(part);
    } else {
      const kbd = document.createElement('kbd');
      kbd.textContent = part[0];
      span.append(kbd);
    }
  }
  return span;
}

function open(host: string, shortcuts: Shortcut[], hotkeys: Hotkeys): { close: () => void } {
  const previous = document.activeElement as HTMLElement | null;
  const container = document.createElement('div');
  container.setAttribute('data-bp-palette', '');
  container.style.cssText = 'all:initial';
  const unbindAppearance = bindShortcutAppearance(container);
  const root = container.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${STYLE}</style><dialog aria-label="Site shortcuts">
    <header><span class="title">Shortcuts</span><span class="site"></span></header>
    <ul role="listbox" tabindex="0" aria-label="Site shortcuts"></ul>
    <p class="empty"></p>
    <footer></footer>
  </dialog>`;
  const dialog = root.querySelector('dialog') as HTMLDialogElement;
  const list = root.querySelector('ul') as HTMLUListElement;
  const empty = root.querySelector('.empty') as HTMLElement;
  const footer = root.querySelector('footer') as HTMLElement;
  (root.querySelector('.site') as HTMLElement).textContent = host;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (current === handle) current = null;
    if (dialog.open) dialog.close();
    unbindAppearance();
    container.remove();
    if (previous?.isConnected && previous !== document.body)
      previous.focus({ preventScroll: true });
  };
  const handle = { close };

  const go = (shortcut: Shortcut, newTab: boolean) => {
    const url = shortcutUrl(shortcut.url);
    if (!url) return;
    close();
    if (newTab) window.open(url, '_blank', 'noopener');
    else location.assign(url);
  };

  let selected = shortcuts.length ? 0 : -1;
  const items = shortcuts.map((shortcut, index) => {
    const li = document.createElement('li');
    li.id = `bp-shortcut-${index}`;
    li.setAttribute('role', 'option');
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = shortcut.label;
    const path = document.createElement('span');
    path.className = 'path';
    const other = hostOf(shortcut.url);
    path.textContent = `${other && other !== host ? `${other} · ` : ''}${shortcutPath(shortcut.url)}`;
    li.append(label, path);
    li.title = shortcut.url;
    // Survol = sélection, seulement si la souris bouge vraiment (pas à l'ouverture sous le curseur).
    li.addEventListener('mousemove', (e) => e.isTrusted && selected !== index && select(index));
    li.addEventListener('mousedown', (e) => e.button === 1 && e.preventDefault()); // pas d'autoscroll
    li.addEventListener('click', (e) => e.isTrusted && go(shortcut, e.metaKey || e.ctrlKey));
    li.addEventListener('auxclick', (e) => e.isTrusted && e.button === 1 && go(shortcut, true));
    return li;
  });
  list.append(...items);

  function select(index: number) {
    selected = index;
    items.forEach((li, i) => li.setAttribute('aria-selected', String(i === index)));
    const item = items[index];
    if (item) {
      list.setAttribute('aria-activedescendant', item.id);
      item.scrollIntoView({ block: 'nearest' });
    }
  }

  list.addEventListener('keydown', (e) => {
    if (!e.isTrusted) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const shortcut = shortcuts[selected];
      if (shortcut) go(shortcut, e.metaKey || e.ctrlKey);
    } else if (NAV_KEYS.has(e.key)) {
      e.preventDefault(); // pas de défilement de la page
      select(stepIndex(selected, e.key, items.length));
    }
  });

  // Échap (événement « cancel » du dialog) et clic sur le fond assombri.
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('click', (e) => e.isTrusted && e.target === dialog && close());

  // Les touches et clics dans la palette ne déclenchent pas les raccourcis du site.
  for (const type of ISOLATED_EVENTS) {
    container.addEventListener(type, (e) => e.stopPropagation());
  }

  if (shortcuts.length) {
    empty.hidden = true;
    footer.append(
      hint(['↑↓'], ' choose'),
      hint(['↵'], ' open'),
      hint([IS_MAC ? '⌘↵' : 'Ctrl+↵'], ' new tab'),
    );
  } else {
    list.hidden = true;
    empty.append(`No shortcuts for ${host}. `);
    empty.append(
      hotkeys.record
        ? hint('Press ', [hotkeys.record], ' to record one.')
        : 'Create one from the ReFace panel.',
    );
  }
  footer.append(
    hotkeys.palette ? hint(['Esc'], ' or ', [hotkeys.palette], ' close') : hint(['Esc'], ' close'),
  );

  document.documentElement.appendChild(container);
  dialog.showModal();
  if (shortcuts.length) {
    select(0);
    list.focus({ preventScroll: true });
  }
  return handle;
}

export function registerShortcutPalette(): void {
  chrome.runtime.onMessage.addListener((message: Partial<ShortcutPaletteToggle> | undefined) => {
    if (message?.type !== 'shortcut:palette') return false;
    if (current) {
      current.close();
    } else if (!opening) {
      opening = true;
      const host = location.hostname;
      void readShortcuts(host).then((shortcuts) => {
        opening = false;
        current = open(host, shortcuts, message.hotkeys ?? { record: '', palette: '' });
      });
    }
    return false;
  });
}
