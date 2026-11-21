import { Tabs } from '@base-ui/react/tabs';
import { GearSixIcon } from '@phosphor-icons/react/dist/csr/GearSix';
import { MotionConfig } from 'motion/react';
import { useEffect, useState } from 'react';
import { ThemeBackground } from '../shared/ThemeBackground';
import { useAppearance } from '../shared/appearance';
import { MoonIcon } from '@phosphor-icons/react/dist/csr/Moon';
import { SunIcon } from '@phosphor-icons/react/dist/csr/Sun';
import { Brand } from '../shared/Brand';
import { callContent } from '../shared/messages';
import { sensitiveReason } from '../shared/sensitive';
import { setPaused } from '../shared/storage';
import { Chat } from './Chat';
import { useSite } from './hooks';
import { Rules } from './Rules';
import { Catalogue } from './Catalogue';
import { useActiveTab, type ActiveTab } from './tab';
import { AssemblyDiagram, Segmented, Switch } from './ui';

type View = 'edit' | 'rules' | 'catalogue';

function Site({ tab }: { tab: ActiveTab }) {
  const { site, paused } = useSite(tab.host);
  const [saveRequest, setSaveRequest] = useState(0);
  const [view, setView] = useState<View>('edit');
  const [original, setOriginalState] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    callContent(tab.id, 'original', {})
      .then((r) => alive && setOriginalState(r.original))
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [tab.id, tab.url]);

  async function toggleOriginal(next: boolean) {
    setOriginalState(next);
    setControlError(null);
    try {
      const r = await callContent(tab.id, 'original', { set: next });
      setOriginalState(r.original);
    } catch (error) {
      setOriginalState(!next);
      setControlError(error instanceof Error ? error.message : String(error));
    }
  }
  const enabledCount = site.rules.filter((r) => r.enabled).length;
  return (
    <>
      <section className="site-context" aria-label="Page actuelle">
        <div className="section-meta">
          <span className="eyebrow">Page actuelle</span>
          <span className={`site-state ${paused ? 'is-paused' : ''}`}>
            <span />
            {paused ? 'En pause' : 'Actif'}
          </span>
        </div>
        <p className="site-host" data-testid="host">
          {tab.host}
        </p>
        <div className="site-controls">
          <Segmented
            label="Comparer avec la page d’origine"
            value={original ? 'original' : 'modified'}
            onChange={(v) => void toggleOriginal(v === 'original')}
            options={[
              { value: 'original', label: 'Original' },
              { value: 'modified', label: 'Modifié' },
            ]}
          />
          <div className="pause-control">
            <span>Pause</span>
            <Switch
              checked={paused}
              label="Pause sur ce site"
              onChange={(p) => {
                setControlError(null);
                void setPaused(tab.host, p).catch((error) =>
                  setControlError(error instanceof Error ? error.message : String(error)),
                );
              }}
            />
          </div>
        </div>
        {paused && (
          <p className="context-note">
            Les modifications enregistrées sont suspendues sur ce site.
          </p>
        )}
        {controlError && (
          <p className="message message-error" role="alert">
            {controlError}
          </p>
        )}
      </section>
      <Tabs.Root
        value={view}
        onValueChange={(value) => {
          if (value !== 'catalogue') setSaveRequest(0);
          setView(value as View);
        }}
        className="workspace-tabs"
      >
        <Tabs.List className="workspace-nav" aria-label="Outils de la page">
          <Tabs.Tab value="edit" className="workspace-tab">
            Modifier
          </Tabs.Tab>
          <Tabs.Tab
            value="rules"
            className="workspace-tab"
            aria-label={`Modifications (${enabledCount}/${site.rules.length})`}
          >
            Modifications <span className="tab-count">{site.rules.length}</span>
          </Tabs.Tab>
          <Tabs.Tab value="catalogue" className="workspace-tab">
            Catalogue
          </Tabs.Tab>
          <Tabs.Indicator className="workspace-indicator" />
        </Tabs.List>
        <Tabs.Panel value="edit" keepMounted className="workspace-panel">
          <Chat tab={tab} aiBlocked={sensitiveReason(tab.url)} onSaved={() => setView('rules')} />
        </Tabs.Panel>
        <Tabs.Panel value="rules" className="workspace-panel">
          <Rules
            site={site}
            onCatalogue={() => {
              setSaveRequest((value) => value + 1);
              setView('catalogue');
            }}
          />
        </Tabs.Panel>
        <Tabs.Panel value="catalogue" className="workspace-panel">
          <Catalogue key={saveRequest} tab={tab} site={site} initialSave={saveRequest > 0} />
        </Tabs.Panel>
      </Tabs.Root>
      <footer className="app-footer">
        <span className="footer-line" />
        <span>Les changements gardés reviennent à chaque visite.</span>
      </footer>
    </>
  );
}

export function App() {
  const tab = useActiveTab();
  const { appearance, toggleAppearance } = useAppearance();
  return (
    <MotionConfig reducedMotion="user">
      <ThemeBackground appearance={appearance} />
      <main className="app-shell">
        <header className="app-header">
          <Brand appearance={appearance} />
          <div className="header-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={
                appearance === 'light' ? 'Activer le mode sombre' : 'Activer le mode clair'
              }
              title={appearance === 'light' ? 'Mode sombre' : 'Mode clair'}
              onClick={toggleAppearance}
            >
              {appearance === 'light' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Options"
              title="Options"
              onClick={() => chrome.runtime.openOptionsPage()}
            >
              <GearSixIcon size={19} weight="regular" />
            </button>
          </div>
        </header>
        {tab?.host ? (
          <Site key={`${tab.id}:${tab.host}`} tab={tab} />
        ) : (
          <section className="empty-page">
            <AssemblyDiagram />
            <p className="eyebrow">Prêt à ajuster</p>
            <h1>Une page à votre mesure.</h1>
            <p data-testid="host">Ouvrez une page web (http ou https) pour la modifier.</p>
          </section>
        )}
      </main>
    </MotionConfig>
  );
}
