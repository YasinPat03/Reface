import { sectionOf } from '../shared/section';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import {
  sameTheme,
  deletePrivateEntry,
  applyCatalogueEntry,
  capturePage,
  catalogueRuleId,
  CATALOGUE_PREFIX,
  CATALOGUE_REQUIRES_CODE,
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
    (rule) =>
      rule.enabled &&
      (rule.scope === 'page'
        ? rule.pagePath === pagePath
        : !rule.section || rule.section === sectionOf(pagePath)),
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
            setMessage({ error: true, text: 'Your collection couldn’t be loaded.' });
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
        setMessage({ error: true, text: 'The public catalogue is unavailable right now.' });
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
        text: error instanceof Error ? error.message : 'Try again in a moment.',
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
      setMessage({ error: true, text: 'Add a title and a short description.' });
      return;
    }
    const code = new FormData(event.currentTarget as HTMLFormElement).get('publisherCode');
    await run(
      async () => {
        if (form === 'save') await savePrivateEntry(capturePage(site, tab.url, title, description));
        else {
          const published = await publishEntry(
            form,
            title,
            description,
            typeof code === 'string' ? code : undefined,
          );
          setPublicEntries((previous) => [published, ...previous]);
        }
        setForm(null);
      },
      form === 'save'
        ? 'Theme saved to your private collection.'
        : 'Your theme was published to the public catalogue.',
    );
  }

  return (
    <section className="catalogue" aria-label="Catalogue">
      <header className="rules-heading">
        <h2>Catalogue</h2>
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
        <Tabs.List className="catalogue-nav" aria-label="Catalogue sections">
          <Tabs.Tab value="private" className="button">
            Private <span className="tab-count">{privateEntries.length}</span>
          </Tabs.Tab>
          <Tabs.Tab value="public" className="button">
            Public
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="private">
          <div className="catalogue-intro">
            <button className="button" disabled={!canSave || busy} onClick={() => openForm('save')}>
              Save this page
            </button>
            {!canSave && <p>Keep a change on this page to create a theme.</p>}
          </div>
          {!privateEntries.length && !form && (
            <p className="rules-empty">Your collection is ready for its first theme.</p>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="public">
          <div className="catalogue-intro">
            <p>Themes shared by the ReFace community.</p>
            <button
              className="text-button"
              disabled={loading || busy}
              onClick={() => void loadPublic()}
            >
              Refresh
            </button>
          </div>
        </Tabs.Panel>
      </Tabs.Root>
      {form && (
        <form
          className="catalogue-form"
          onSubmit={submit}
          aria-label={form === 'save' ? 'Save a private theme' : 'Publish a theme'}
        >
          <h3>{form === 'save' ? 'A theme to keep' : 'Share your theme'}</h3>
          <p className="catalogue-page">
            {form === 'save' ? tab.host + pagePath : form.host + form.pagePath}
          </p>
          <label htmlFor="catalogue-title">Title</label>
          <input
            autoFocus
            id="catalogue-title"
            className="form-input"
            required
            maxLength={80}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <label htmlFor="catalogue-description">Short description</label>
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
              The title, description, target page and styles will be added to the public catalogue.
            </p>
          )}
          {form !== 'save' && CATALOGUE_REQUIRES_CODE && (
            <div className="catalogue-publisher">
              <label htmlFor="catalogue-publisher-code">Publishing code</label>
              <input
                id="catalogue-publisher-code"
                name="publisherCode"
                className="form-input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                required
                maxLength={47}
                aria-describedby="catalogue-publisher-help"
              />
              <p className="field-help" id="catalogue-publisher-help">
                Ask the ReFace team for a code to publish a theme.
              </p>
            </div>
          )}
          <div className="catalogue-actions">
            <button
              type="button"
              className="button button-ghost"
              disabled={busy}
              onClick={() => setForm(null)}
            >
              Cancel
            </button>
            <button className="button button-primary" disabled={busy}>
              {busy ? 'One moment…' : form === 'save' ? 'Save' : 'Publish'}
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
          Loading themes…
        </p>
      )}
      <ul
        className="catalogue-list"
        aria-label={section === 'private' ? 'Private themes' : 'Public themes'}
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
                  aria-label={`Delete ${entry.title} from the private collection`}
                  title="Delete"
                  disabled={busy}
                  onClick={() =>
                    void run(() => deletePrivateEntry(entry), 'Theme removed from your collection.')
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
                {entry.rules.length} change{entry.rules.length > 1 ? 's' : ''}
              </span>
              <div className="catalogue-actions">
                {section === 'public' ? (
                  <button
                    className="button catalogue-selected"
                    disabled={busy || imported}
                    onClick={() =>
                      void run(async () => {
                        await savePrivateEntry(entry);
                      }, 'Theme added to your private collection.')
                    }
                  >
                    {imported ? 'In your collection' : 'Add to my collection'}
                  </button>
                ) : (
                  <>
                    <button
                      className="button catalogue-selected"
                      disabled={busy || !applicable || applied}
                      title={applicable ? undefined : 'Open the page shown to apply this theme.'}
                      onClick={() =>
                        void run(
                          () => applyCatalogueEntry(entry, tab.url),
                          'Theme applied to this page.',
                        )
                      }
                    >
                      {applied ? 'Applied' : applicable ? 'Apply' : 'Other page'}
                    </button>
                    <button
                      className="button"
                      disabled={busy || alreadyPublic}
                      onClick={() => openForm(entry)}
                    >
                      {alreadyPublic ? 'Already public' : 'Publish'}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {section === 'public' && !loading && !publicEntries.length && !message && (
        <p className="rules-empty">No public themes yet.</p>
      )}
    </section>
  );
}
