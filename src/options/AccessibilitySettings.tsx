import { useEffect, useState } from 'react';
import { Switch } from '../panel/ui';
import { callBg } from '../shared/messages';
import {
  ACCESSIBILITY_CONTRAST,
  ACCESSIBILITY_KEYS,
  ACCESSIBILITY_MASTER,
  ACCESSIBILITY_PALETTE,
  type ACCESSIBILITY_RULES,
} from '../shared/accessibility';

const groups = [
  {
    title: 'Lecture',
    options: {
      'reface-accessibility:v1:text-size': 'Taille minimale du texte',
      'reface-accessibility:v1:line-spacing': 'Interligne plus large',
      'reface-accessibility:v1:letter-spacing': 'Espacement des caractères',
      'reface-accessibility:v1:word-spacing': 'Espacement des mots',
      'reface-accessibility:v1:reading-font': 'Police plus lisible',
      'reface-accessibility:v1:short-lines': 'Lignes plus courtes dans les articles',
    },
  },
  {
    title: 'Repères visuels',
    options: {
      'reface-accessibility:v1:underline-links': 'Souligner les liens',
      'reface-accessibility:v1:selection-cues': 'Sélections plus visibles',
      'reface-accessibility:v1:form-errors': 'Erreurs de formulaire visibles',
      [ACCESSIBILITY_CONTRAST]: 'Contraste renforcé',
    },
  },
  {
    title: 'Interaction',
    options: {
      'reface-accessibility:v1:visible-focus': 'Focus clavier visible',
      'reface-accessibility:v1:larger-controls': 'Commandes plus grandes',
      'reface-accessibility:v1:control-spacing': 'Espacer les commandes groupées',
      'reface-accessibility:v1:field-outlines': 'Champs plus faciles à repérer',
    },
  },
  {
    title: 'Mouvement',
    options: {
      'reface-accessibility:v1:reduced-motion': 'Réduire les animations décoratives',
      'reface-accessibility:v1:instant-scroll': 'Défilement sans animation',
    },
  },
] satisfies { title: string; options: Partial<Record<keyof typeof ACCESSIBILITY_RULES, string>> }[];

export function AccessibilitySettings() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState(false);
  const [description, setDescription] = useState('');
  const [suggestionStatus, setSuggestionStatus] = useState('');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let active = true;
    function refresh() {
      void chrome.storage.local.get(ACCESSIBILITY_KEYS).then(
        (values) => {
          if (active) setSettings(values);
        },
        () => {
          if (active) setError(true);
        },
      );
    }
    const onChange: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (area === 'local' && ACCESSIBILITY_KEYS.some((key) => key in changes)) refresh();
    };
    chrome.storage.onChanged.addListener(onChange);
    refresh();
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(onChange);
    };
  }, []);

  function update(key: string, value: boolean | 'light' | 'dark') {
    setError(false);
    void chrome.storage.local.set({ [key]: value }).catch(() => setError(true));
  }

  async function applySuggestions(event: React.FormEvent) {
    event.preventDefault();
    setError(false);
    setApplying(true);
    setSuggestionStatus('');
    try {
      const { keys: matches } = await callBg('suggestAccessibility', {
        description: description.trim(),
      });
      if (matches.length === 0) {
        setSuggestionStatus(
          'Aucun réglage adapté trouvé. Indiquez ce qui vous gêne sur les sites.',
        );
        return;
      }
      await chrome.storage.local.set({
        ...Object.fromEntries(matches.map((key) => [key, true])),
        [ACCESSIBILITY_MASTER]: true,
      });
      const labels = groups.flatMap(({ options }) => Object.entries(options));
      const selected = new Set(matches);
      const names = labels.filter(([key]) => selected.has(key)).map(([, label]) => label);
      setSuggestionStatus('Réglages activés : ' + names.join(', ') + '.');
    } catch (error) {
      setSuggestionStatus(
        error instanceof Error ? error.message : 'Impossible de proposer des réglages.',
      );
    } finally {
      setApplying(false);
    }
  }

  const enabled = settings?.[ACCESSIBILITY_MASTER] !== false;

  return (
    <section
      className="settings-section accessibility-settings"
      aria-labelledby="accessibility-title"
    >
      <h2 id="accessibility-title">Accessibilité</h2>
      <form className="accessibility-description" onSubmit={applySuggestions}>
        <label className="field-label" htmlFor="accessibility-description">
          Décrivez vos besoins d’accessibilité
        </label>
        <textarea
          id="accessibility-description"
          className="form-input"
          rows={2}
          disabled={applying}
          maxLength={500}
          placeholder="J’ai besoin de texte plus grand et de boutons plus faciles à cliquer."
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setSuggestionStatus('');
          }}
        />
        <button
          className="button button-primary"
          type="submit"
          disabled={!settings || applying || !description.trim()}
        >
          {applying ? 'Analyse en cours…' : 'Appliquer les suggestions'}
        </button>
        <span className="field-help accessibility-description-status" role="status">
          {suggestionStatus}
        </span>
      </form>
      <div className="accessibility-setting">
        <span>Appliquer les réglages</span>
        <Switch
          label="Appliquer les réglages"
          checked={enabled}
          disabled={!settings}
          onChange={(checked) => update(ACCESSIBILITY_MASTER, checked)}
        />
      </div>
      {groups.map(({ title, options }) => (
        <section className="accessibility-group" key={title}>
          <h3>{title}</h3>
          {Object.entries(options).map(([key, label]) => (
            <div key={key}>
              <div className="accessibility-setting">
                <span>{label}</span>
                <Switch
                  label={label}
                  checked={settings?.[key] === true}
                  disabled={!settings || !enabled}
                  onChange={(checked) => update(key, checked)}
                />
              </div>
              {key === ACCESSIBILITY_CONTRAST && settings?.[key] === true && (
                <label className="accessibility-setting">
                  <span>Palette de contraste</span>
                  <select
                    className="accessibility-palette"
                    value={settings[ACCESSIBILITY_PALETTE] === 'dark' ? 'dark' : 'light'}
                    disabled={!enabled}
                    onChange={(event) =>
                      update(
                        ACCESSIBILITY_PALETTE,
                        event.target.value === 'dark' ? 'dark' : 'light',
                      )
                    }
                  >
                    <option value="light">Claire</option>
                    <option value="dark">Sombre</option>
                  </select>
                </label>
              )}
            </div>
          ))}
        </section>
      ))}
      {error && <p role="alert">Impossible d’accéder aux réglages d’accessibilité.</p>}
    </section>
  );
}
