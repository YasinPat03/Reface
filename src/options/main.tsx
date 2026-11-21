import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/ui.css';
import { callBg } from '../shared/messages';
import { getSettings, setSettings } from '../shared/storage';
import type { Settings } from '../shared/types';

/** Fournisseurs compatibles OpenAI. Les noms de modèles évoluent : « Tester » liste ceux disponibles. */
const PROVIDERS = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b' },
  {
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash-lite',
  },
] as const;

type Test =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; models: string[]; modelFound: boolean }
  | { status: 'error'; message: string };

const input =
  'w-full rounded-md border border-zinc-300 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-violet-500 dark:border-zinc-700';

function Options() {
  const [settings, setLocal] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<Test>({ status: 'idle' });
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    void getSettings().then(setLocal);
  }, []);

  if (!settings) return null;

  const update = (patch: Partial<Settings>) => {
    setLocal({ ...settings, ...patch });
    setSaved(false);
    setTest({ status: 'idle' });
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const clean = {
      apiKey: settings!.apiKey.trim(),
      baseUrl: settings!.baseUrl.trim().replace(/\/+$/, ''),
      model: settings!.model.trim(),
    };
    await setSettings(clean);
    setLocal(clean);
    setSaved(true);
  }

  async function runTest() {
    setTest({ status: 'testing' });
    try {
      setTest({ status: 'ok', ...(await callBg('testConnection', settings!)) });
    } catch (error) {
      setTest({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Browser Paint · Options</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Le modèle d’IA qui génère les modifications. Votre clé reste sur cet appareil
          (chrome.storage.local) et n’est envoyée qu’au fournisseur choisi.
        </p>
      </header>

      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => update({ baseUrl: p.baseUrl, model: p.model })}
              className={`rounded-md border px-3 py-1 text-sm ${
                settings.baseUrl === p.baseUrl
                  ? 'border-violet-500 text-violet-700 dark:text-violet-300'
                  : 'border-zinc-200 dark:border-zinc-800'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Clé API
          <div className="flex gap-2">
            <input
              className={input}
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              value={settings.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              placeholder="sk-…"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="rounded-md px-2 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {showKey ? 'Masquer' : 'Afficher'}
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          URL de base (API compatible OpenAI)
          <input
            className={input}
            type="url"
            required
            value={settings.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Modèle
          <input
            className={input}
            required
            list="bp-models"
            value={settings.model}
            onChange={(e) => update({ model: e.target.value })}
          />
          <datalist id="bp-models">
            {test.status === 'ok' && test.models.map((m) => <option key={m} value={m} />)}
          </datalist>
          <span className="text-xs font-normal text-zinc-500">
            Choisissez un modèle rapide, sans mode « raisonnement », qui supporte les structured
            outputs (json_schema).
          </span>
        </label>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
          >
            Enregistrer
          </button>
          <button
            type="button"
            onClick={runTest}
            disabled={test.status === 'testing'}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
          >
            {test.status === 'testing' ? 'Test…' : 'Tester la connexion'}
          </button>
          {saved && (
            <span className="text-sm text-emerald-700 dark:text-emerald-400">Enregistré.</span>
          )}
        </div>

        {test.status === 'ok' && (
          <p role="status" className="text-sm">
            ✅ Connexion réussie ({test.models.length} modèles).{' '}
            {test.modelFound ? (
              <span>Le modèle « {settings.model} » est disponible.</span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400">
                « {settings.model} » n’apparaît pas dans la liste : choisissez-en un dans le champ
                Modèle.
              </span>
            )}
          </p>
        )}
        {test.status === 'error' && (
          <p role="alert" className="text-sm text-red-600">
            {test.message}
          </p>
        )}
      </form>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Options />
  </StrictMode>,
);
