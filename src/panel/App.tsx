import { useState } from 'react';
import { callBg } from '../shared/messages';

type PingState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; host: string; content: 'ok' | 'unreachable' }
  | { status: 'error'; message: string };

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error('Aucun onglet actif.');
  return tab.id;
}

export function App() {
  const [ping, setPing] = useState<PingState>({ status: 'idle' });

  async function runPing() {
    setPing({ status: 'loading' });
    try {
      const result = await callBg('ping', { tabId: await activeTabId() });
      setPing({ status: 'done', ...result });
    } catch (error) {
      setPing({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <main className="flex min-h-screen flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Browser Paint</h1>
        <button
          type="button"
          className="text-sm text-zinc-500 underline-offset-2 hover:underline"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          Options
        </button>
      </header>

      <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="mb-2 text-sm text-zinc-500">
          Test de la chaîne panel → service worker → page
        </p>
        <button
          type="button"
          onClick={runPing}
          disabled={ping.status === 'loading'}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {ping.status === 'loading' ? 'Ping…' : 'Ping'}
        </button>
        {ping.status === 'done' && (
          <p className="mt-2 text-sm">
            Onglet : <code>{ping.host || '(aucun hôte)'}</code> · page :{' '}
            {ping.content === 'ok' ? '✅ connectée' : '⚠️ injoignable (rechargez l’onglet)'}
          </p>
        )}
        {ping.status === 'error' && <p className="mt-2 text-sm text-red-600">{ping.message}</p>}
      </section>
    </main>
  );
}
