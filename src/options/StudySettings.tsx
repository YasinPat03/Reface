// Pré-étude des pages (« carte du site ») : activée par défaut, désactivable, cache effaçable.
import { useEffect, useState } from 'react';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { Switch } from '../panel/ui';
import { STUDY_ENABLED_KEY, STUDY_PREFIX } from '../shared/study';

export function StudySettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [forgotten, setForgotten] = useState<number | null>(null);
  useEffect(() => {
    void chrome.storage.local
      .get(STUDY_ENABLED_KEY)
      .then((data) => setEnabled(data[STUDY_ENABLED_KEY] !== false));
  }, []);

  async function toggle(value: boolean) {
    setEnabled(value);
    if (value) await chrome.storage.local.remove(STUDY_ENABLED_KEY);
    else await chrome.storage.local.set({ [STUDY_ENABLED_KEY]: false });
  }

  async function forget() {
    const keys = Object.keys(await chrome.storage.local.get(null)).filter((key) =>
      key.startsWith(STUDY_PREFIX),
    );
    await chrome.storage.local.remove(keys);
    setForgotten(keys.length);
  }

  return (
    <section className="settings-section" aria-label="Page study">
      <h2>Page study</h2>
      <p className="field-help">
        When the panel opens, ReFace studies each new site or section in the background so the AI
        already knows the page. Sends the page outline to your provider; never on sensitive sites.
        Studies are kept 30 days.
      </p>
      <div className="settings-actions">
        <Switch
          checked={enabled ?? true}
          disabled={enabled === null}
          label={enabled === false ? 'Turn on page study' : 'Turn off page study'}
          onChange={(value) => void toggle(value)}
        />
        <span>{enabled === false ? 'Off' : 'On'}</span>
        <button type="button" className="button" onClick={() => void forget()}>
          Forget studied pages
        </button>
        {forgotten !== null && (
          <span className="save-notice" role="status">
            <CheckIcon size={16} aria-hidden="true" />
            {forgotten} page {forgotten === 1 ? 'study' : 'studies'} forgotten.
          </span>
        )}
      </div>
    </section>
  );
}
