import { useState } from 'react';
import {
  addShortcut,
  shortcutUrl,
  stopRecording,
  type ShortcutRecording,
} from '../../shared/shortcuts';
import { errorMessage, type ActiveTab } from '../tab';
import { useRecording, useShortcuts, useTabPage } from './hooks';

const secondary =
  'rounded-md px-3 py-1.5 text-sm hover:bg-violet-100 disabled:opacity-50 dark:hover:bg-violet-900';

/** Barre affichée pendant l'enregistrement d'un raccourci. Rien si aucun enregistrement. */
export function RecordingBar({ tab, onSaved }: { tab: ActiveTab; onSaved?: () => void }) {
  const recording = useRecording();
  if (!recording) return null;
  return (
    <div
      data-testid="recording-bar"
      className="flex flex-col gap-2 rounded-lg border border-violet-300 bg-violet-50 p-2.5 text-sm dark:border-violet-900 dark:bg-violet-950/40"
    >
      {recording.tabId === tab.id ? (
        <Recording key={recording.startedAt} recording={recording} onSaved={onSaved} />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p>Enregistrement d’un raccourci en cours dans un autre onglet.</p>
          <button type="button" className={secondary} onClick={() => void stopRecording()}>
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}

function Recording({ recording, onSaved }: { recording: ShortcutRecording; onSaved?: () => void }) {
  const page = useTabPage(recording.tabId);
  const site = useShortcuts(recording.host);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = shortcutUrl(page.url);
  const duplicate = url !== null && site.shortcuts.some((s) => s.url === url);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // Relu au moment du clic : l'URL et le titre les plus récents de l'onglet.
      const tab = await chrome.tabs.get(recording.tabId);
      const { added } = await addShortcut(recording.host, tab.url ?? '', tab.title ?? '');
      if (!added) {
        setError('Ce raccourci existe déjà.');
        return;
      }
      await stopRecording();
      onSaved?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p>
        <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
        <strong>Raccourci pour {recording.host}</strong> : naviguez jusqu’à la page voulue, puis
        cliquez sur « C’est cette page ».
      </p>
      <div
        data-testid="recording-page"
        className="rounded-md bg-white/70 px-2 py-1.5 dark:bg-zinc-900/70"
      >
        <p className="truncate font-medium">{page.title || 'Page sans titre'}</p>
        <p className="truncate font-mono text-[10px] text-zinc-500">{page.url}</p>
      </div>
      {page.url && !url && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Cette page ne peut pas servir de raccourci.
        </p>
      )}
      {duplicate && (
        <p className="text-xs text-amber-700 dark:text-amber-400">Ce raccourci existe déjà.</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !url || duplicate}
          onClick={() => void save()}
          className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          C’est cette page
        </button>
        <button type="button" className={secondary} onClick={() => void stopRecording()}>
          Annuler
        </button>
      </div>
    </>
  );
}
