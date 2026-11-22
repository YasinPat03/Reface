import { useEffect, useState } from 'react';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { callBg } from '../shared/messages';
import { resetOnboarding } from '../shared/onboarding';
import { getSettings, setSettings } from '../shared/storage';
import type { Settings } from '../shared/types';
import { AccessibilitySettings } from './AccessibilitySettings';

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
        <h1>Réglages</h1>
      </div>
      <AccessibilitySettings />
      <form onSubmit={save}>
        <section className="settings-section" aria-label="Fournisseur">
          <h2>Fournisseur</h2>
          <p className="field-help">
            Votre clé reste sur cet appareil et n’est envoyée qu’au fournisseur choisi.
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
        <section className="settings-section settings-fields" aria-label="Connexion">
          <div>
            <label className="field-label" htmlFor="bp-api-key">
              Clé API
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
                {showKey ? 'Masquer' : 'Afficher'}
              </button>
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="bp-base-url">
              URL de base (API compatible OpenAI)
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
              Modèle
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
              Le modèle doit accepter les réponses JSON structurées. « Tester la connexion » liste
              les modèles disponibles.
            </span>
          </div>
        </section>
        <div className="settings-actions">
          <button type="submit" className="button button-primary">
            Enregistrer
          </button>
          <button
            type="button"
            onClick={runTest}
            disabled={test.status === 'testing'}
            className="button"
          >
            {test.status === 'testing' ? 'Test…' : 'Tester la connexion'}
          </button>
          {saved && (
            <span className="save-notice" role="status">
              <CheckIcon size={16} aria-hidden="true" />
              Enregistré.
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
              Connexion réussie ({test.models.length} modèles).{' '}
              {test.modelFound ? (
                <>Le modèle « {settings.model} » est disponible.</>
              ) : (
                <>
                  « {settings.model} » n’apparaît pas dans la liste : choisissez-en un dans le champ
                  Modèle.
                </>
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
      <section className="settings-section" aria-label="Présentation">
        <h2>Présentation</h2>
        <p className="field-help">Revoyez la visite guidée du panneau, zone par zone.</p>
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
            Revoir la présentation
          </button>
          {replayQueued && (
            <span className="save-notice" role="status">
              <CheckIcon size={16} aria-hidden="true" />
              Elle se jouera à la prochaine ouverture du panneau.
            </span>
          )}
        </div>
      </section>
    </>
  );
}
