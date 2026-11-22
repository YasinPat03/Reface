import { APPEARANCE_KEY } from '../shared/appearanceKey';

// Shadow roots use the same surfaces and contrast as the side panel.
export const shortcutAppearance = `
  :host{color-scheme:light;--surface:#f4f4f5;--ink:#17171b;--muted:#3f3f46;
    --line:#a1a1aa;--accent:#26262c;--accent-soft:#d4d4d8;--on-ink:#fafafa;
    --success:#285445;--error:#912e23;
    --sans:"IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace}
  :host([data-appearance=dark]){color-scheme:dark;--surface:#202c38;--ink:#f3f6fa;--muted:#d7e0ea;
    --line:#64798c;--accent:#bbdcd9;--accent-soft:#2d464b;--on-ink:#18272c;
    --success:#c6e1d1;--error:#ffc6bc}
  [hidden]{display:none!important}
  kbd{font:11px/1.5 var(--mono);padding:0 4px;border:1px solid var(--line);border-radius:3px;white-space:nowrap}
`;

export function bindShortcutAppearance(host: HTMLElement): () => void {
  let active = true;
  const apply = (value: unknown) => {
    if (active) host.dataset.appearance = value === 'dark' ? 'dark' : 'light';
  };
  const onChange: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
    if (area === 'local' && APPEARANCE_KEY in changes) apply(changes[APPEARANCE_KEY]?.newValue);
  };
  chrome.storage.onChanged.addListener(onChange);
  void chrome.storage.local
    .get(APPEARANCE_KEY)
    .then((values) => apply(values[APPEARANCE_KEY]))
    .catch(() => undefined);
  return () => {
    active = false;
    chrome.storage.onChanged.removeListener(onChange);
  };
}
