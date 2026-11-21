import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import {
  sameTheme,
  deletePrivateEntry,
  applyCatalogueEntry,
  capturePage,
  catalogueRuleId,
  CATALOGUE_PREFIX,
  getPrivateCatalogue,
  getPublicCatalogue,
  matchesPage,
  publishEntry,
  savePrivateEntry,
} from '../shared/catalogue';
import type { CatalogueEntry } from '../shared/catalogueSchema';
import type { SiteRules } from '../shared/types';
import type { ActiveTab } from './tab';

export function Catalogue({
  tab,
  site,
  initialSave = false,
}: {
  tab: ActiveTab;
  site: SiteRules;
  initialSave?: boolean;
}) {
  const publicRequest = useRef({ revision: 0 });
  const [section, setSection] = useState<'private' | 'public'>('private');
  const [privateEntries, setPrivateEntries] = useState<CatalogueEntry[]>([]);
  const [publicEntries, setPublicEntries] = useState<CatalogueEntry[]>([]);
  const [form, setForm] = useState<'save' | CatalogueEntry | null>(initialSave ? 'save' : null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const pagePath = new URL(tab.url).pathname;
  const canSave = site.rules.some(
    (rule) => rule.enabled && (rule.scope !== 'page' || rule.pagePath === pagePath),
  );

  useEffect(() => {
    const requests = publicRequest.current;
    let alive = true;
    let revision = 0;
    const refresh = () => {
      const current = ++revision;
      void getPrivateCatalogue()
        .then((entries) => {
          if (alive && current === revision) setPrivateEntries(entries);
        })
        .catch(() => {
          if (alive && current === revision)
            setMessage({ error: true, text: 'Votre collection n’a pas pu être chargée.' });
        });
    };
    refresh();
    void getPublicCatalogue()
      .then((entries) => {
        if (alive) setPublicEntries(entries);
      })
      .catch(() => undefined);
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && Object.keys(changes).some((key) => key.startsWith(CATALOGUE_PREFIX)))
        refresh();
    };
    chrome.storage.onChanged.addListener(changed);
    return () => {
      alive = false;
      ++requests.revision;
      chrome.storage.onChanged.removeListener(changed);
    };
  }, []);

  async function loadPublic() {
    const request = ++publicRequest.current.revision;
    setLoading(true);
    setMessage(null);
    try {
      const entries = await getPublicCatalogue();
      if (request === publicRequest.current.revision) setPublicEntries(entries);
    } catch {
      if (request === publicRequest.current.revision)
        setMessage({ error: true, text: 'Le catalogue public est indisponible pour le moment.' });
    } finally {
      if (request === publicRequest.current.revision) setLoading(false);
    }
  }

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ error: false, text: success });
    } catch (error) {
      setMessage({
        error: true,
        text: error instanceof Error ? error.message : 'Réessayez dans un instant.',
      });
    } finally {
      setBusy(false);
    }
  }

  function openForm(value: 'save' | CatalogueEntry) {
    setForm(value);
    setTitle(value === 'save' ? '' : value.title);
    setDescription(value === 'save' ? '' : value.description);
    setMessage(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    if (!title.trim() || !description.trim()) {
      setMessage({ error: true, text: 'Ajoutez un titre et une petite description.' });
      return;
    }
    await run(
      async () => {
        if (form === 'save') await savePrivateEntry(capturePage(site, tab.url, title, description));
        else {
          const published = await publishEntry(form, title, description);
          setPublicEntries((previous) => [published, ...previous]);
        }
        setForm(null);
      },
      form === 'save'
        ? 'Thème enregistré dans votre collection privée.'
        : 'Votre thème a été publié dans le catalogue public de démonstration.',
    );
  }

  return (
    <section className="catalogue" aria-label="Catalogue">
      <header className="rules-heading">
        <p className="eyebrow">Vos thèmes, à retrouver</p>
        <h2>Catalogue</h2>
        <p className="rules-description">
          Gardez une version de vos modifications ou découvrez celles à essayer.
        </p>
      </header>
      <Tabs.Root
        value={section}
        onValueChange={(value) => {
          const next = value as typeof section;
          ++publicRequest.current.revision;
          setLoading(false);
          setSection(next);
          setForm(null);
          setMessage(null);
          if (next === 'public') void loadPublic();
        }}
      >
        <Tabs.List className="catalogue-nav" aria-label="Sections du catalogue">
          <Tabs.Tab value="private" className="button">
            Privée <span className="tab-count">{privateEntries.length}</span>
          </Tabs.Tab>
          <Tabs.Tab value="public" className="button">
            Publique
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="private">
          <div className="catalogue-intro">
            <p>Votre collection reste sur cet appareil.</p>
            <button className="button" disabled={!canSave || busy} onClick={() => openForm('save')}>
              Enregistrer cette page
            </button>
            {!canSave && <p>Gardez une modification sur cette page pour créer un thème.</p>}
          </div>
          {!privateEntries.length && !form && (
            <p className="rules-empty">
              Votre collection est prête à accueillir son premier thème.
            </p>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="public">
          <div className="catalogue-intro">
            <p>Catalogue partagé de démonstration.</p>
            <button
              className="text-button"
              disabled={loading || busy}
              onClick={() => void loadPublic()}
            >
              Actualiser
            </button>
          </div>
        </Tabs.Panel>
      </Tabs.Root>
      {form && (
        <form
          className="catalogue-form"
          onSubmit={submit}
          aria-label={form === 'save' ? 'Enregistrer un thème privé' : 'Publier un thème'}
        >
          <h3>{form === 'save' ? 'Un thème à garder' : 'Partager votre thème'}</h3>
          <p className="catalogue-page">
            {form === 'save' ? tab.host + pagePath : form.host + form.pagePath}
          </p>
          <label htmlFor="catalogue-title">Titre</label>
          <input
            autoFocus
            id="catalogue-title"
            className="form-input"
            required
            maxLength={80}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <label htmlFor="catalogue-description">Petite description</label>
          <textarea
            id="catalogue-description"
            className="form-input"
            required
            maxLength={240}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          {form !== 'save' && (
            <p className="field-help">
              Le titre, la description, la page cible et les styles seront ajoutés au catalogue
              public de démonstration.
            </p>
          )}
          <div className="catalogue-actions">
            <button
              type="button"
              className="button button-ghost"
              disabled={busy}
              onClick={() => setForm(null)}
            >
              Annuler
            </button>
            <button className="button button-primary" disabled={busy}>
              {busy ? 'Un instant…' : form === 'save' ? 'Enregistrer' : 'Publier'}
            </button>
          </div>
        </form>
      )}
      {message && (
        <p
          role={message.error ? 'alert' : 'status'}
          className={`message ${message.error ? 'message-error' : 'message-success'}`}
        >
          {message.text}
        </p>
      )}
      {section === 'public' && loading && (
        <p role="status" className="rules-description">
          Chargement des thèmes…
        </p>
      )}
      <ul
        className="catalogue-list"
        aria-label={section === 'private' ? 'Thèmes privés' : 'Thèmes publics'}
      >
        {(section === 'private' ? privateEntries : publicEntries).map((entry) => {
          const imported = privateEntries.some(
            (saved) => saved.id === entry.id || sameTheme(saved, entry),
          );
          const alreadyPublic = publicEntries.some((publicTheme) => sameTheme(publicTheme, entry));
          const applicable = matchesPage(entry, tab.url);
          const applied =
            applicable &&
            [0].every((i) =>
              site.rules.some((rule) => rule.id === catalogueRuleId(entry, i) && rule.enabled),
            );
          return (
            <li className="catalogue-entry" key={entry.id}>
              {section === 'private' && (
                <button
                  type="button"
                  className="icon-button catalogue-remove"
                  aria-label={`Supprimer ${entry.title} de la collection privée`}
                  title="Supprimer"
                  disabled={busy}
                  onClick={() =>
                    void run(() => deletePrivateEntry(entry), 'Thème retiré de votre collection.')
                  }
                >
                  ×
                </button>
              )}
              <p className="catalogue-page">
                {entry.host}
                {entry.pagePath}
              </p>
              <h3>{entry.title}</h3>
              <p>{entry.description}</p>
              <span className="catalogue-count">
                {entry.rules.length} modification{entry.rules.length > 1 ? 's' : ''}
              </span>
              <div className="catalogue-actions">
                {section === 'public' ? (
                  <button
                    className="button catalogue-selected"
                    disabled={busy || imported}
                    onClick={() =>
                      void run(async () => {
                        await savePrivateEntry(entry);
                      }, 'Thème ajouté à votre collection privée.')
                    }
                  >
                    {imported ? 'Dans votre collection' : 'Ajouter à ma collection'}
                  </button>
                ) : (
                  <>
                    <button
                      className="button catalogue-selected"
                      disabled={busy || !applicable || applied}
                      title={
                        applicable ? undefined : 'Ouvrez la page indiquée pour appliquer ce thème.'
                      }
                      onClick={() =>
                        void run(
                          () => applyCatalogueEntry(entry, tab.url),
                          'Thème appliqué sur cette page.',
                        )
                      }
                    >
                      {applied ? 'Appliqué' : applicable ? 'Appliquer' : 'Autre page'}
                    </button>
                    <button
                      className="button"
                      disabled={busy || alreadyPublic}
                      onClick={() => openForm(entry)}
                    >
                      {alreadyPublic ? 'Déjà public' : 'Publier'}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {section === 'public' && !loading && !publicEntries.length && !message && (
        <p className="rules-empty">Aucun thème public pour le moment.</p>
      )}
    </section>
  );
}
