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
    title: 'Reading',
    options: {
      'reface-accessibility:v1:text-size': 'Minimum text size',
      'reface-accessibility:v1:line-spacing': 'Wider line spacing',
      'reface-accessibility:v1:letter-spacing': 'Letter spacing',
      'reface-accessibility:v1:word-spacing': 'Word spacing',
      'reface-accessibility:v1:reading-font': 'More readable font',
      'reface-accessibility:v1:short-lines': 'Shorter lines in articles',
    },
  },
  {
    title: 'Visual cues',
    options: {
      'reface-accessibility:v1:underline-links': 'Underline links',
      'reface-accessibility:v1:selection-cues': 'More visible selections',
      'reface-accessibility:v1:form-errors': 'Visible form errors',
      [ACCESSIBILITY_CONTRAST]: 'Higher contrast',
    },
  },
  {
    title: 'Interaction',
    options: {
      'reface-accessibility:v1:visible-focus': 'Visible keyboard focus',
      'reface-accessibility:v1:larger-controls': 'Larger controls',
      'reface-accessibility:v1:control-spacing': 'Space out grouped controls',
      'reface-accessibility:v1:field-outlines': 'Easier-to-spot fields',
    },
  },
  {
    title: 'Motion',
    options: {
      'reface-accessibility:v1:reduced-motion': 'Reduce decorative animations',
      'reface-accessibility:v1:instant-scroll': 'Scrolling without animation',
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
        setSuggestionStatus('No suitable setting found. Describe what bothers you on websites.');
        return;
      }
      await chrome.storage.local.set({
        ...Object.fromEntries(matches.map((key) => [key, true])),
        [ACCESSIBILITY_MASTER]: true,
      });
      const labels = groups.flatMap(({ options }) => Object.entries(options));
      const selected = new Set(matches);
      const names = labels.filter(([key]) => selected.has(key)).map(([, label]) => label);
      setSuggestionStatus('Settings turned on: ' + names.join(', ') + '.');
    } catch (error) {
      setSuggestionStatus(error instanceof Error ? error.message : 'Couldn’t suggest settings.');
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
      <h2 id="accessibility-title">Accessibility</h2>
      <form className="accessibility-description" onSubmit={applySuggestions}>
        <label className="field-label" htmlFor="accessibility-description">
          Describe your accessibility needs
        </label>
        <textarea
          id="accessibility-description"
          className="form-input"
          rows={2}
          disabled={applying}
          maxLength={500}
          placeholder="I need bigger text and buttons that are easier to click."
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
          {applying ? 'Analyzing…' : 'Apply suggestions'}
        </button>
        <span className="field-help accessibility-description-status" role="status">
          {suggestionStatus}
        </span>
      </form>
      <div className="accessibility-setting">
        <span>Apply settings</span>
        <Switch
          label="Apply settings"
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
                  <span>Contrast palette</span>
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
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
              )}
            </div>
          ))}
        </section>
      ))}
      {error && <p role="alert">Can’t access the accessibility settings.</p>}
    </section>
  );
}
