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
          Aucune touche n’est attribuée pour {name}.{' '}
          <button type="button" className="text-button" onClick={onConfigure}>
            Configurer
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
      aria-label="Raccourcis du site"
      data-testid="shortcuts-tab"
    >
      <header className="rules-heading">
        <p className="eyebrow">Sur ce site</p>
        <h2>Vos raccourcis.</h2>
        <p className="rules-description">
          Revenez en un clic aux pages enfouies, chaque fois que vous êtes sur {tab.host}.
        </p>
      </header>

      {site.shortcuts.length === 0 ? (
        <p className="rules-empty">
          Aucun raccourci sur ce site. Créez-en un pour revenir en un clic à une page enfouie.
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
                      aria-label="Nom du raccourci"
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
                    {here && <span className="tab-count shortcut-here">page actuelle</span>}
                    <button
                      type="button"
                      aria-label="Renommer ce raccourci"
                      title="Renommer"
                      onClick={() => setEditing(shortcut.id)}
                      className="icon-button"
                    >
                      <PencilSimpleIcon size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Supprimer ce raccourci"
                      title="Supprimer"
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
          Créer un raccourci
        </button>
        <p className="field-help">
          Naviguez ensuite jusqu’à la page voulue, puis cliquez sur « C’est cette page ».
        </p>
        <HotkeyHint
          hotkey={recordKey}
          testId="hotkey-hint"
          name="enregistrer un raccourci"
          action="sur n’importe quelle page : démarre un raccourci sans ouvrir le panel, puis l’enregistre."
          onConfigure={configureKeys}
        />
        <HotkeyHint
          hotkey={paletteKey}
          testId="palette-hint"
          name="afficher les raccourcis"
          action="affiche les raccourcis du site directement sur la page."
          onConfigure={configureKeys}
        />
      </div>
    </section>
  );
}
