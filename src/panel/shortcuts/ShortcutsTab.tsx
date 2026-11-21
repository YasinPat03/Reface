import { useState, type MouseEvent } from 'react';
import {
  MAX_LABEL,
  removeShortcut,
  renameShortcut,
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

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.pathname + u.search + u.hash);
  } catch {
    return url;
  }
}

/** Onglet « Raccourcis » : créer un raccourci, puis y aller en un clic. */
export function ShortcutsTab({ tab }: { tab: ActiveTab }) {
  const site = useShortcuts(tab.host);
  const recording = useRecording();
  const hotkey = useHotkey();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    fn().catch((e) => setError(errorMessage(e)));
  };

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
    <section className="flex flex-col gap-3" data-testid="shortcuts-tab">
      <div className="flex flex-col gap-1">
        <button
          type="button"
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
          className="self-start rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          Créer un raccourci
        </button>
        <p className="text-xs text-zinc-500">
          Naviguez ensuite jusqu’à la page voulue : elle sera accessible en un clic depuis cet
          onglet, chaque fois que vous êtes sur {tab.host}.
        </p>
        {hotkey !== null && (
          <p className="text-xs text-zinc-500" data-testid="hotkey-hint">
            {hotkey ? (
              <>
                Astuce :{' '}
                <kbd className="rounded border border-zinc-300 px-1 font-sans dark:border-zinc-700">
                  {hotkey}
                </kbd>{' '}
                sur n’importe quelle page démarre un raccourci sans ouvrir le panel, puis
                l’enregistre.
              </>
            ) : (
              <>
                Aucune touche n’est attribuée au raccourci clavier.{' '}
                <button
                  type="button"
                  onClick={() =>
                    run(() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }))
                  }
                  className="text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
                >
                  Configurer
                </button>
              </>
            )}
          </p>
        )}
      </div>

      {site.shortcuts.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Aucun raccourci sur ce site. Créez-en un pour revenir en un clic à une page enfouie.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="shortcuts">
          {site.shortcuts.map((shortcut) => {
            const otherHost = hostOf(shortcut.url) !== tab.host ? hostOf(shortcut.url) : null;
            const here = shortcut.url === tab.url;
            return (
              <li
                key={shortcut.id}
                data-testid="shortcut"
                className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800"
              >
                {editing === shortcut.id ? (
                  <form
                    className="flex items-center gap-2"
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
                      className="min-w-0 flex-1 rounded border border-zinc-300 bg-transparent px-1.5 py-0.5 text-sm dark:border-zinc-700"
                    />
                    <button
                      type="submit"
                      className="rounded px-1.5 text-xs text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950"
                    >
                      OK
                    </button>
                  </form>
                ) : (
                  <div className="flex items-start gap-2">
                    <a
                      href={shortcut.url}
                      title={shortcut.url}
                      onClick={(e) => go(e, shortcut)}
                      onAuxClick={(e) => go(e, shortcut)}
                      className="min-w-0 flex-1 text-sm hover:text-violet-700 dark:hover:text-violet-300"
                    >
                      <span className="line-clamp-2 font-medium">{shortcut.label}</span>
                      <span className="block truncate font-mono text-[10px] text-zinc-500">
                        {otherHost ? `${otherHost} · ` : ''}
                        {pathOf(shortcut.url)}
                      </span>
                    </a>
                    {here && (
                      <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                        page actuelle
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label="Renommer ce raccourci"
                      title="Renommer"
                      onClick={() => setEditing(shortcut.id)}
                      className="rounded px-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      aria-label="Supprimer ce raccourci"
                      title="Supprimer"
                      onClick={() => run(() => removeShortcut(site.host, shortcut.id))}
                      className="rounded px-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
