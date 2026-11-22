import { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { TrashSimpleIcon } from '@phosphor-icons/react/dist/csr/TrashSimple';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { motion } from 'motion/react';
import { useState, type MouseEvent } from 'react';
import {
  MAX_LABEL,
  PALETTE_COMMAND,
  RECORD_COMMAND,
  removeShortcut,
  renameShortcut,
  shortcutPath,
  startRecording,
  type Shortcut,
} from '../../shared/shortcuts';
import { errorMessage, type ActiveTab } from '../tab';
import { useHotkey, useRecording, useShortcuts } from './hooks';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Ligne d'astuce pour une touche ; sans touche attribuée, propose de la configurer. */
function HotkeyHint({
  hotkey,
  name,
  action,
  testId,
  onConfigure,
}: {
  hotkey: string | null;
  /** Nom court de l'action, pour le cas sans touche. */
  name: string;
  action: string;
  testId: string;
  onConfigure: () => void;
}) {
  if (hotkey === null) return null;
  return (
    <p className="shortcut-hint" data-testid={testId}>
      {hotkey ? (
        <>
          <kbd className="shortcut-key">{hotkey}</kbd> {action}
        </>
      ) : (
        <>
          No key is assigned to {name}.{' '}
          <button type="button" className="text-button" onClick={onConfigure}>
            Configure
          </button>
        </>
      )}
    </p>
  );
}

/** Onglet « Raccourcis » (design ReFace) : créer un raccourci, puis y aller en un clic. */
export function ShortcutsTab({ tab }: { tab: ActiveTab }) {
  const site = useShortcuts(tab.host);
  const recording = useRecording();
  const recordKey = useHotkey(RECORD_COMMAND);
  const paletteKey = useHotkey(PALETTE_COMMAND);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    fn().catch((e) => setError(errorMessage(e)));
  };

  const configureKeys = () =>
    run(() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

  // Clic : l'onglet courant va sur la page. Cmd/Ctrl-clic ou clic molette : nouvel onglet.
  function go(event: MouseEvent, shortcut: Shortcut) {
    event.preventDefault();
    if (event.button === 2) return;
    const newTab = event.metaKey || event.ctrlKey || event.button === 1;
    run(() =>
      newTab
        ? chrome.tabs.create({ url: shortcut.url, openerTabId: tab.id })
        : chrome.tabs.update(tab.id, { url: shortcut.url }),
    );
  }

  return (
    <section
      className="rules-workspace shortcuts-workspace"
      aria-label="Site shortcuts"
      data-testid="shortcuts-tab"
    >
      <header className="rules-heading">
        <p className="eyebrow">On this site</p>
        <h2>Your shortcuts.</h2>
        <p className="rules-description">
          Get back to buried pages in one click, whenever you’re on {tab.host}.
        </p>
      </header>

      {site.shortcuts.length === 0 ? (
        <p className="rules-empty">
          No shortcuts on this site. Create one to get back to a buried page in one click.
        </p>
      ) : (
        <ul className="rule-list" data-testid="shortcuts">
          {site.shortcuts.map((shortcut) => {
            const otherHost = hostOf(shortcut.url) !== tab.host ? hostOf(shortcut.url) : null;
            const here = shortcut.url === tab.url;
            return (
              <motion.li
                key={shortcut.id}
                layout
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                data-testid="shortcut"
                className="rule"
              >
                {editing === shortcut.id ? (
                  <form
                    className="rule-main shortcut-rename"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const label = new FormData(e.currentTarget).get('label');
                      setEditing(null);
                      run(() => renameShortcut(site.host, shortcut.id, String(label ?? '')));
                    }}
                  >
                    <input
                      name="label"
                      aria-label="Shortcut name"
                      defaultValue={shortcut.label}
                      maxLength={MAX_LABEL}
                      autoFocus
                      onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                      className="form-input"
                    />
                    <button type="submit" className="button">
                      OK
                    </button>
                  </form>
                ) : (
                  <div className="rule-main">
                    <a
                      href={shortcut.url}
                      title={shortcut.url}
                      onClick={(e) => go(e, shortcut)}
                      onAuxClick={(e) => go(e, shortcut)}
                      className="rule-title shortcut-link"
                    >
                      <span className="shortcut-label">{shortcut.label}</span>
                      <span className="rule-selector shortcut-path">
                        {otherHost ? `${otherHost} · ` : ''}
                        {shortcutPath(shortcut.url)}
                      </span>
                    </a>
                    {here && <span className="tab-count shortcut-here">current page</span>}
                    <button
                      type="button"
                      aria-label="Rename this shortcut"
                      title="Rename"
                      onClick={() => setEditing(shortcut.id)}
                      className="icon-button"
                    >
                      <PencilSimpleIcon size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete this shortcut"
                      title="Delete"
                      onClick={() => run(() => removeShortcut(site.host, shortcut.id))}
                      className="icon-button"
                    >
                      <TrashSimpleIcon size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </motion.li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="message message-error">
          <WarningCircleIcon size={17} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      <div className="rule-tools">
        <button
          type="button"
          className="button"
          disabled={recording !== null}
          onClick={() =>
            run(() =>
              startRecording({
                tabId: tab.id,
                host: tab.host,
                startUrl: tab.url,
                startedAt: new Date().toISOString(),
              }),
            )
          }
        >
          <PlusIcon size={16} aria-hidden="true" />
          Create a shortcut
        </button>
        <p className="field-help">
          Then navigate to the page you want, and click “This is the page”.
        </p>
        <HotkeyHint
          hotkey={recordKey}
          testId="hotkey-hint"
          name="recording a shortcut"
          action="on any page: starts a shortcut without opening the panel, then saves it."
          onConfigure={configureKeys}
        />
        <HotkeyHint
          hotkey={paletteKey}
          testId="palette-hint"
          name="showing the shortcuts"
          action="shows the site’s shortcuts right on the page."
          onConfigure={configureKeys}
        />
      </div>
    </section>
  );
}
