import { useEffect, useState } from 'react';
import { callContent } from '../shared/messages';
import { sensitiveReason } from '../shared/sensitive';
import { setPaused } from '../shared/storage';
import { Chat } from './Chat';
import { useSite } from './hooks';
import { Rules } from './Rules';
import { RecordingBar, ShortcutsTab, useShortcutCount } from './shortcuts';
import { useActiveTab, type ActiveTab } from './tab';
import { Segmented, Switch } from './ui';

type View = 'edit' | 'rules' | 'shortcuts';

function Site({ tab }: { tab: ActiveTab }) {
  const { site, paused } = useSite(tab.host);
  const shortcutCount = useShortcutCount(tab.host);
  const [view, setView] = useState<View>('edit');
  const [original, setOriginalState] = useState(false);

  // État réel de la bascule Original/Modifié dans l'onglet (elle ne survit pas à un reload).
  useEffect(() => {
    let alive = true;
    callContent(tab.id, 'original', {})
      .then((r) => alive && setOriginalState(r.original))
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [tab.id, tab.url]);

  async function toggleOriginal(next: boolean) {
    setOriginalState(next);
    try {
      const r = await callContent(tab.id, 'original', { set: next });
      setOriginalState(r.original);
    } catch {
      setOriginalState(!next);
    }
  }

  const enabledCount = site.rules.filter((r) => r.enabled).length;

  return (
    <>
      <section className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-900">
        <Segmented
          label="Comparer avec la page d’origine"
          value={original ? 'original' : 'modified'}
          onChange={(v) => void toggleOriginal(v === 'original')}
          options={[
            { value: 'original', label: 'Original' },
            { value: 'modified', label: 'Modifié' },
          ]}
        />
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          Pause sur ce site
          <Switch
            checked={paused}
            label="Pause sur ce site"
            onChange={(p) => void setPaused(tab.host, p)}
          />
        </label>
      </section>
      {paused && (
        <p className="-mt-2 text-xs text-amber-700 dark:text-amber-400">
          En pause : aucune modification n’est appliquée sur {tab.host}.
        </p>
      )}
      <RecordingBar tab={tab} onSaved={() => setView('shortcuts')} />

      <nav className="flex gap-4 border-b border-zinc-200 text-sm dark:border-zinc-800">
        {(
          [
            ['edit', 'Modifier'],
            ['rules', `Modifications (${enabledCount}/${site.rules.length})`],
            ['shortcuts', `Raccourcis (${shortcutCount})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setView(value)}
            className={`-mb-px border-b-2 pb-2 ${
              view === value
                ? 'border-violet-600 font-medium text-zinc-900 dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Chat reste monté (preview en cours conservée) quand on consulte la liste. */}
      <div hidden={view !== 'edit'}>
        <Chat tab={tab} aiBlocked={sensitiveReason(tab.url)} onSaved={() => setView('rules')} />
      </div>
      {view === 'rules' && <Rules site={site} tabId={tab.id} />}
      {view === 'shortcuts' && <ShortcutsTab tab={tab} />}
    </>
  );
}

export function App() {
  const tab = useActiveTab();

  return (
    <main className="flex min-h-screen flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/icons/icon32.png" alt="" className="h-6 w-6" />
          <div>
            <h1 className="text-base font-semibold leading-tight">Browser Paint</h1>
            <p className="text-xs text-zinc-500" data-testid="host">
              {tab?.host || 'Page non modifiable'}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="text-sm text-zinc-500 underline-offset-2 hover:underline"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          Options
        </button>
      </header>

      {tab?.host ? (
        <Site key={`${tab.id}:${tab.host}`} tab={tab} />
      ) : (
        <p className="text-sm text-zinc-500">
          Ouvrez une page web (http ou https) pour la modifier.
        </p>
      )}
    </main>
  );
}
