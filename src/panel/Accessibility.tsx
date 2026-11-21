import { useEffect, useState } from 'react';
import {
  accessibilityKey,
  accessibilityCssKey,
  compileAccessibility,
  DEFAULT_ACCESSIBILITY,
  readAccessibility,
  type AccessibilitySettings,
} from '../shared/accessibility';
import { Switch } from './ui';

export function Accessibility({ host }: { host: string }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(DEFAULT_ACCESSIBILITY);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const key = accessibilityKey(host);
    const apply = (raw: unknown) => {
      if (alive) {
        setSettings(readAccessibility(raw));
        setReady(true);
      }
    };
    void chrome.storage.local
      .get(key)
      .then((data) => apply(data[key]))
      .catch(() => {
        if (alive)
          setError('Impossible de charger les préférences. Rouvrez cet onglet pour réessayer.');
      });
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && key in changes) apply(changes[key]?.newValue);
    };
    chrome.storage.onChanged.addListener(changed);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(changed);
    };
  }, [host]);
  async function save(next: AccessibilitySettings) {
    setBusy(true);
    setError('');
    try {
      await chrome.storage.local.set({
        [accessibilityKey(host)]: next,
        [accessibilityCssKey(host)]: compileAccessibility(next),
      });
      setSettings(next);
    } catch {
      setError('Enregistrement impossible. Vos réglages précédents sont conservés.');
    } finally {
      setBusy(false);
    }
  }
  const update = (patch: Partial<AccessibilitySettings>) => void save({ ...settings, ...patch });
  return (
    <section className="accessibility-panel" aria-label="Préférences d’accessibilité">
      <div className="section-meta">
        <span className="eyebrow">À votre mesure</span>
        <span className="eyebrow">03 modes</span>
      </div>
      <h1>Un web plus confortable.</h1>
      <p className="context-note">
        Combinez les modes. Chaque réglage s’applique immédiatement et reste enregistré sur ce site.
        Pause et Original suspendent aussi ces réglages.
      </p>
      {error && (
        <p className="message message-error" role="alert">
          {error}
        </p>
      )}
      <fieldset disabled={!ready || busy} className="accessibility-fields" aria-busy={busy}>
        <section className="accessibility-card">
          <div className="accessibility-heading">
            <div>
              <span className="eyebrow">01 · Basse vision</span>
              <h2>Lire facilement</h2>
            </div>
            <Switch
              checked={settings.vision}
              label="Activer Lire facilement"
              onChange={(vision) => update({ vision })}
              disabled={!ready || busy}
            />
          </div>
          <p>Texte agrandi, liens soulignés et espacement confortable.</p>
          {settings.vision && (
            <div className="accessibility-options">
              <label>
                Taille minimale du texte
                <select
                  value={settings.textSize}
                  onChange={(e) => update({ textSize: Number(e.target.value) })}
                >
                  {[16, 18, 20, 24, 28].map((n) => (
                    <option key={n} value={n}>
                      {n} px
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Interligne
                <select
                  value={settings.lineHeight}
                  onChange={(e) => update({ lineHeight: Number(e.target.value) })}
                >
                  {[1.4, 1.6, 1.8, 2].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Contraste
                <select
                  value={settings.contrast}
                  onChange={(e) =>
                    update({ contrast: e.target.value as AccessibilitySettings['contrast'] })
                  }
                >
                  <option value="original">Couleurs d’origine</option>
                  <option value="light">Papier clair</option>
                  <option value="dark">Encre sombre</option>
                </select>
              </label>
            </div>
          )}
        </section>
        <section className="accessibility-card">
          <div className="accessibility-heading">
            <div>
              <span className="eyebrow">02 · Vision des couleurs</span>
              <h2>Distinguer clairement</h2>
            </div>
            <Switch
              checked={settings.color}
              label="Activer Distinguer clairement"
              onChange={(color) => update({ color })}
              disabled={!ready || busy}
            />
          </div>
          <p>
            Liens soulignés, sélections encadrées et erreurs signalées par une bordure en
            pointillés.
          </p>
          <p className="context-note">
            Utilise les états indiqués par le site. Les graphiques et images restent inchangés.
          </p>
        </section>
        <section className="accessibility-card">
          <div className="accessibility-heading">
            <div>
              <span className="eyebrow">03 · Mobilité</span>
              <h2>Cliquer facilement</h2>
            </div>
            <Switch
              checked={settings.motor}
              label="Activer Cliquer facilement"
              onChange={(motor) => update({ motor })}
              disabled={!ready || busy}
            />
          </div>
          <p>Boutons, champs et liens de navigation plus grands et mieux espacés.</p>
          {settings.motor && (
            <div className="accessibility-options">
              <label>
                Taille des cibles
                <select
                  value={settings.targetSize}
                  onChange={(e) => update({ targetSize: Number(e.target.value) })}
                >
                  <option value="44">Standard · 44 px</option>
                  <option value="52">Large · 52 px</option>
                  <option value="64">Très large · 64 px</option>
                </select>
              </label>
              <label>
                Espace entre les contrôles
                <select
                  value={settings.spacing}
                  onChange={(e) => update({ spacing: Number(e.target.value) })}
                >
                  {[0, 4, 8, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} px
                    </option>
                  ))}
                </select>
              </label>
              <p className="context-note">
                Les liens dans le texte restent en place. Si une mise en page devient trop dense,
                réduisez la taille ou l’espacement.
              </p>
            </div>
          )}
        </section>
        <button
          type="button"
          className="accessibility-reset"
          onClick={() => void save({ ...DEFAULT_ACCESSIBILITY })}
        >
          Réinitialiser les trois modes
        </button>
      </fieldset>
      <p className="context-note" role="status">
        {busy ? 'Enregistrement…' : ready ? 'Préférences enregistrées sur ce site.' : 'Chargement…'}
      </p>
    </section>
  );
}
