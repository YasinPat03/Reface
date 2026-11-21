import { useEffect, useRef, useState } from 'react';
import {
  GLOBAL_ACCESSIBILITY_KEY,
  GLOBAL_ACCESSIBILITY_CSS_KEY,
  compileAccessibility,
  DEFAULT_ACCESSIBILITY,
  readAccessibility,
  suggestAccessibility,
  type AccessibilitySettings,
} from '../shared/accessibility';
import { Switch } from './ui';

export function Accessibility({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [description, setDescription] = useState('');
  const [settings, setSettings] = useState<AccessibilitySettings>(DEFAULT_ACCESSIBILITY);
  const [proposal, setProposal] = useState<ReturnType<typeof suggestAccessibility> | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let alive = true;
    void chrome.storage.local
      .get(GLOBAL_ACCESSIBILITY_KEY)
      .then((data) => {
        if (alive) {
          setSettings(readAccessibility(data[GLOBAL_ACCESSIBILITY_KEY]));
          setReady(true);
        }
      })
      .catch(() => {
        if (alive)
          setError('Impossible de charger vos préférences. Fermez puis rouvrez cette fenêtre.');
      });
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && GLOBAL_ACCESSIBILITY_KEY in changes && alive)
        setSettings(readAccessibility(changes[GLOBAL_ACCESSIBILITY_KEY]?.newValue));
    };
    chrome.storage.onChanged.addListener(changed);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(changed);
    };
  }, []);
  async function save(next: AccessibilitySettings) {
    setBusy(true);
    setError('');
    try {
      await chrome.storage.local.set({
        [GLOBAL_ACCESSIBILITY_KEY]: next,
        [GLOBAL_ACCESSIBILITY_CSS_KEY]: compileAccessibility(next),
      });
      setSettings(next);
      setStatus('Préférences enregistrées pour tous les sites compatibles.');
    } catch {
      setError('Enregistrement impossible. Vos préférences précédentes sont conservées.');
    } finally {
      setBusy(false);
    }
  }
  const suggestions = proposal?.suggestions ?? suggestAccessibility('').suggestions;
  return (
    <dialog
      ref={dialog}
      className="accessibility-dialog"
      aria-labelledby="accessibility-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <section className="accessibility-panel">
        <div className="section-meta">
          <span className="eyebrow">Votre confort, partout</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Fermer les préférences d’accessibilité"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <h1 id="accessibility-title">Un web à votre mesure.</h1>
        <p className="context-note">
          Décrivez votre handicap ou ce qui vous gêne. ReFace vous propose trois ajustements
          personnalisables, enregistrés pour toutes vos visites.
        </p>
        <form
          className="accessibility-intake"
          onSubmit={(event) => {
            event.preventDefault();
            const next = suggestAccessibility(description);
            setProposal(next);
            setSettings(next.settings);
            setStatus('Proposition prête. Choisissez vos ajustements, puis enregistrez.');
          }}
        >
          <label htmlFor="accessibility-description">Qu’est-ce qui vous aiderait ?</label>
          <textarea
            id="accessibility-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            placeholder="Ex. : je suis malvoyant, ou j’ai des tremblements et les petits boutons sont difficiles à cliquer."
            rows={3}
          />
          <p className="context-note">
            Description facultative, analysée localement, jamais enregistrée ni envoyée à une IA.
            Vous pouvez aussi choisir directement ci-dessous.
          </p>
          <button
            type="submit"
            className="accessibility-primary"
            disabled={!ready || busy || !description.trim()}
          >
            Proposer mes trois ajustements
          </button>
        </form>
        {proposal && !proposal.matched && (
          <p className="context-note">
            Nous n’avons pas reconnu un besoin précis. Voici les trois options disponibles :
            choisissez ce qui vous convient.
          </p>
        )}
        {error && (
          <p className="message message-error" role="alert">
            {error}
          </p>
        )}
        <fieldset disabled={!ready || busy} className="accessibility-fields">
          <legend className="eyebrow">Trois ajustements · à combiner librement</legend>
          {suggestions.map((suggestion, index) => (
            <section className="accessibility-card" key={suggestion.key}>
              <div className="accessibility-heading">
                <div>
                  <span className="eyebrow">0{index + 1}</span>
                  <h2>{suggestion.title}</h2>
                </div>
                <Switch
                  checked={settings[suggestion.key]}
                  label={suggestion.title}
                  onChange={(value) => {
                    setSettings((current) => ({ ...current, [suggestion.key]: value }));
                    setStatus('Modifications non enregistrées.');
                  }}
                  disabled={!ready || busy}
                />
              </div>
              <p>{suggestion.description}</p>
              {suggestion.key === 'vision' && settings.vision && (
                <div className="accessibility-options">
                  <label>
                    Taille minimale du texte
                    <select
                      value={settings.textSize}
                      onChange={(e) => {
                        setSettings({ ...settings, textSize: Number(e.target.value) });
                        setStatus('Modifications non enregistrées.');
                      }}
                    >
                      {[16, 18, 20, 24, 28].map((n) => (
                        <option key={n} value={n}>
                          {n} px
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Contraste
                    <select
                      value={settings.contrast}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          contrast: e.target.value as AccessibilitySettings['contrast'],
                        });
                        setStatus('Modifications non enregistrées.');
                      }}
                    >
                      <option value="original">Couleurs du site</option>
                      <option value="light">Papier clair</option>
                      <option value="dark">Encre sombre</option>
                    </select>
                  </label>
                </div>
              )}
              {suggestion.key === 'motor' && settings.motor && (
                <div className="accessibility-options">
                  <label>
                    Taille des contrôles
                    <select
                      value={settings.targetSize}
                      onChange={(e) => {
                        setSettings({ ...settings, targetSize: Number(e.target.value) });
                        setStatus('Modifications non enregistrées.');
                      }}
                    >
                      <option value="44">Standard · 44 px</option>
                      <option value="52">Large · 52 px</option>
                      <option value="64">Très large · 64 px</option>
                    </select>
                  </label>
                </div>
              )}
            </section>
          ))}
          <button
            type="button"
            className="accessibility-primary"
            onClick={() => void save(settings)}
          >
            Enregistrer pour tous les sites
          </button>
          <button
            type="button"
            className="accessibility-reset"
            onClick={() => {
              setProposal(null);
              void save({ ...DEFAULT_ACCESSIBILITY });
            }}
          >
            Désactiver partout
          </button>
        </fieldset>
        <p className="context-note" role="status">
          {busy
            ? 'Enregistrement…'
            : status || (ready ? 'Vos choix restent modifiables à tout moment.' : 'Chargement…')}
        </p>
        <p className="context-note">
          Pause et Original suspendent ces ajustements sur le site ouvert. Certaines pages
          protégées, images et interfaces intégrées ne peuvent pas être adaptées.
        </p>
      </section>
    </dialog>
  );
}
