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
      aria-label="Recording a shortcut"
    >
      {recording.tabId === tab.id ? (
        <Recording key={recording.startedAt} recording={recording} onSaved={onSaved} />
      ) : (
        <div className="shortcut-recording-other">
          <p>A shortcut is being recorded in another tab.</p>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void stopRecording()}
          >
            Cancel
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
        setError('This shortcut already exists.');
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
        Recording
      </p>
      <p>
        <strong>Shortcut for {recording.host}</strong>: navigate to the page you want, then click
        “This is the page”.
      </p>
      <div data-testid="recording-page" className="shortcut-page">
        <p className="shortcut-page-title">{page.title || 'Untitled page'}</p>
        <p className="rule-selector shortcut-page-url">{page.url}</p>
      </div>
      {page.url && !url && <Notice tone="caution">This page can’t be used as a shortcut.</Notice>}
      {duplicate && <Notice tone="caution">This shortcut already exists.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="shortcut-recording-actions">
        <button
          type="button"
          className="button button-primary"
          disabled={busy || !url || duplicate}
          onClick={() => void save()}
        >
          This is the page
        </button>
        <button type="button" className="button button-ghost" onClick={() => void stopRecording()}>
          Cancel
        </button>
      </div>
    </>
  );
}
