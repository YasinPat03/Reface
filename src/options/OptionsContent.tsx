import { useEffect, useState } from 'react';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { callBg } from '../shared/messages';
import { resetOnboarding } from '../shared/onboarding';
import { getSettings, setSettings } from '../shared/storage';
import type { Settings } from '../shared/types';
import { AccessibilitySettings } from './AccessibilitySettings';
import { StudySettings } from './StudySettings';

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

/** `onReplayOnboarding` : fourni par le panneau, qui ferme les options pour laisser place à la visite. */
export function OptionsContent({ onReplayOnboarding }: { onReplayOnboarding?: () => void } = {}) {
  const [settings, setLocal] = useState<Settings | null>(null);
  const [replayQueued, setReplayQueued] = useState(false);
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
    <>
      <div className="options-heading">
        <p className="eyebrow">Configuration</p>
        <h1>Settings</h1>
      </div>
      <AccessibilitySettings />
      <form onSubmit={save}>
        <section className="settings-section" aria-label="Provider">
          <h2>Provider</h2>
          <p className="field-help">
            Your key stays on this device and is only sent to the chosen provider.
          </p>
          <div className="provider-options">
            {PROVIDERS.map((provider) => (
              <button
                key={provider.name}
                type="button"
                aria-pressed={settings.baseUrl === provider.baseUrl}
                onClick={() => update({ baseUrl: provider.baseUrl, model: provider.model })}
                className="provider-button"
              >
                {provider.name}
              </button>
            ))}
          </div>
        </section>
        <section className="settings-section settings-fields" aria-label="Connection">
          <div>
            <label className="field-label" htmlFor="bp-api-key">
              API key
            </label>
            <div className="reveal-group">
              <input
                id="bp-api-key"
                className="form-input"
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
                aria-controls="bp-api-key"
                aria-pressed={showKey}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="bp-base-url">
              Base URL (OpenAI-compatible API)
            </label>
            <input
              id="bp-base-url"
              className="form-input"
              type="url"
              required
              value={settings.baseUrl}
              onChange={(e) => update({ baseUrl: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="bp-model">
              Model
            </label>
            <input
              id="bp-model"
              className="form-input"
              required
              list="bp-models"
              value={settings.model}
              onChange={(e) => update({ model: e.target.value })}
              aria-describedby="bp-model-help"
            />
            <datalist id="bp-models">
              {test.status === 'ok' &&
                test.models.map((model) => <option key={model} value={model} />)}
            </datalist>
            <span id="bp-model-help" className="field-help">
              The model must support structured JSON responses. “Test connection” lists the
              available models.
            </span>
          </div>
        </section>
        <div className="settings-actions">
          <button type="submit" className="button button-primary">
            Save
          </button>
          <button
            type="button"
            onClick={runTest}
            disabled={test.status === 'testing'}
            className="button"
          >
            {test.status === 'testing' ? 'Testing…' : 'Test connection'}
          </button>
          {saved && (
            <span className="save-notice" role="status">
              <CheckIcon size={16} aria-hidden="true" />
              Saved.
            </span>
          )}
        </div>
        {test.status === 'ok' && (
          <p
            role="status"
            className={`message ${test.modelFound ? 'message-success' : 'message-caution'}`}
          >
            <CheckIcon size={18} aria-hidden="true" />
            <span>
              Connection successful ({test.models.length} models).{' '}
              {test.modelFound ? (
                <>The model “{settings.model}” is available.</>
              ) : (
                <>“{settings.model}” isn’t in the list: pick one in the Model field.</>
              )}
            </span>
          </p>
        )}
        {test.status === 'error' && (
          <p role="alert" className="message message-error">
            <WarningCircleIcon size={18} aria-hidden="true" />
            <span>{test.message}</span>
          </p>
        )}
      </form>
      <StudySettings />
      <section className="settings-section" aria-label="Tour">
        <h2>Tour</h2>
        <p className="field-help">Replay the guided tour of the panel, area by area.</p>
        <div className="settings-actions">
          <button
            type="button"
            className="button"
            onClick={() => {
              void resetOnboarding().then(() => {
                if (onReplayOnboarding) onReplayOnboarding();
                else setReplayQueued(true);
              }, console.error);
            }}
          >
            Replay the tour
          </button>
          {replayQueued && (
            <span className="save-notice" role="status">
              <CheckIcon size={16} aria-hidden="true" />
              It will play the next time the panel opens.
            </span>
          )}
        </div>
      </section>
    </>
  );
}
