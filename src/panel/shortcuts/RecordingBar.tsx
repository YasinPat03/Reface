import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { useState } from 'react';
import {
  addShortcut,
  shortcutUrl,
  stopRecording,
  type ShortcutRecording,
} from '../../shared/shortcuts';
import { errorMessage, type ActiveTab } from '../tab';
import { useRecording, useShortcuts, useTabPage } from './hooks';

/** Barre affichée (design ReFace) pendant l'enregistrement d'un raccourci. Rien sinon. */
export function RecordingBar({ tab, onSaved }: { tab: ActiveTab; onSaved?: () => void }) {
  const recording = useRecording();
  if (!recording) return null;
  return (
    <section
      data-testid="recording-bar"
      className="shortcut-recording"
      aria-label="Enregistrement d’un raccourci"
    >
      {recording.tabId === tab.id ? (
        <Recording key={recording.startedAt} recording={recording} onSaved={onSaved} />
      ) : (
        <div className="shortcut-recording-other">
          <p>Enregistrement d’un raccourci en cours dans un autre onglet.</p>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void stopRecording()}
          >
            Annuler
          </button>
        </div>
      )}
    </section>
  );
}

function Notice({ tone, children }: { tone: 'caution' | 'error'; children: string }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={`message ${tone === 'error' ? 'message-error' : 'message-caution'}`}
    >
      <WarningCircleIcon size={15} aria-hidden="true" />
      <span>{children}</span>
    </p>
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
      <p className="eyebrow shortcut-recording-title">
        <span className="shortcut-dot" aria-hidden="true" />
        Enregistrement
      </p>
      <p>
        <strong>Raccourci pour {recording.host}</strong> : naviguez jusqu’à la page voulue, puis
        cliquez sur « C’est cette page ».
      </p>
      <div data-testid="recording-page" className="shortcut-page">
        <p className="shortcut-page-title">{page.title || 'Page sans titre'}</p>
        <p className="rule-selector shortcut-page-url">{page.url}</p>
      </div>
      {page.url && !url && (
        <Notice tone="caution">Cette page ne peut pas servir de raccourci.</Notice>
      )}
      {duplicate && <Notice tone="caution">Ce raccourci existe déjà.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="shortcut-recording-actions">
        <button
          type="button"
          className="button button-primary"
          disabled={busy || !url || duplicate}
          onClick={() => void save()}
        >
          C’est cette page
        </button>
        <button type="button" className="button button-ghost" onClick={() => void stopRecording()}>
          Annuler
        </button>
      </div>
    </>
  );
}
