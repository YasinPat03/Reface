import { Chat } from './Chat';
import { useActiveTab } from './tab';

export function App() {
  const tab = useActiveTab();

  return (
    <main className="flex min-h-screen flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Browser Paint</h1>
          <p className="text-xs text-zinc-500" data-testid="host">
            {tab?.host || 'Page non modifiable'}
          </p>
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
        <Chat key={tab.host} tab={tab} />
      ) : (
        <p className="text-sm text-zinc-500">
          Ouvrez une page web (http ou https) pour la modifier.
        </p>
      )}
    </main>
  );
}
