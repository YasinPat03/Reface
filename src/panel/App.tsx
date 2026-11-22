import { Tabs } from '@base-ui/react/tabs';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { OptionsContent } from '../options/OptionsContent';
import { GearSixIcon } from '@phosphor-icons/react/dist/csr/GearSix';
import { MotionConfig } from 'motion/react';
import { useEffect, useState } from 'react';
import { ThemeBackground } from '../shared/ThemeBackground';
import { useAppearance } from '../shared/appearance';
import { MoonIcon } from '@phosphor-icons/react/dist/csr/Moon';
import { PauseIcon } from '@phosphor-icons/react/dist/csr/Pause';
import { SunIcon } from '@phosphor-icons/react/dist/csr/Sun';
import { Brand } from '../shared/Brand';
import { callContent } from '../shared/messages';
import { sensitiveReason } from '../shared/sensitive';
import { setPaused } from '../shared/storage';
import { Chat } from './Chat';
import { useSite } from './hooks';
import { Rules } from './Rules';
import { Catalogue } from './Catalogue';
import { DEMO_TAB, Onboarding, useOnboarding } from './onboarding';
import { RecordingBar, ShortcutsTab, ShortcutsTabLabel, useShortcutCount } from './shortcuts';
import { useActiveTab, type ActiveTab } from './tab';
import { AssemblyDiagram, Segmented, Switch } from './ui';

type View = 'edit' | 'rules' | 'catalogue' | 'shortcuts';

function Site({ tab, active }: { tab: ActiveTab; active: boolean }) {
  const { site, paused } = useSite(tab.host);
  const [saveRequest, setSaveRequest] = useState(0);
  const shortcutCount = useShortcutCount(tab.host);
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
      <section className="site-context" aria-label="Current page">
        <p className="eyebrow">Current page</p>
        <p className="site-host" data-testid="host">
          {tab.host}
        </p>
        <div className="site-controls">
          <Segmented
            tour="compare"
            label="Compare with the original page"
            value={original ? 'original' : 'modified'}
            onChange={(v) => void toggleOriginal(v === 'original')}
            options={[
              { value: 'original', label: 'Original' },
              { value: 'modified', label: 'Modified' },
            ]}
          />
          <div className="pause-control" data-tour="pause">
            <PauseIcon size={14} aria-hidden="true" />
            <Switch
              checked={paused}
              label="Pause on this site"
              onChange={(p) => {
                setControlError(null);
                void setPaused(tab.host, p).catch((error) =>
                  setControlError(error instanceof Error ? error.message : String(error)),
                );
              }}
            />
          </div>
        </div>
        {paused && <p className="context-note">Saved changes are paused on this site.</p>}
        {controlError && (
          <p className="message message-error" role="alert">
            {controlError}
          </p>
        )}
      </section>
      <RecordingBar
        tab={tab}
        onSaved={() => {
          setSaveRequest(0);
          setView('shortcuts');
        }}
      />
      <Tabs.Root
        value={view}
        onValueChange={(value) => {
          if (value !== 'catalogue') setSaveRequest(0);
          setView(value as View);
        }}
        className="workspace-tabs"
      >
        <Tabs.List className="workspace-nav" aria-label="Page tools">
          <Tabs.Tab value="edit" className="workspace-tab" data-tour="tab-edit">
            Edit
          </Tabs.Tab>
          <Tabs.Tab
            value="rules"
            className="workspace-tab"
            data-tour="tab-rules"
            aria-label={`Changes (${enabledCount}/${site.rules.length})`}
          >
            Changes <span className="tab-count">{site.rules.length}</span>
          </Tabs.Tab>
          <Tabs.Tab value="catalogue" className="workspace-tab" data-tour="tab-catalogue">
            Catalogue
          </Tabs.Tab>
          <Tabs.Tab
            value="shortcuts"
            className="workspace-tab"
            data-tour="tab-shortcuts"
            aria-label={`Shortcuts (${shortcutCount})`}
          >
            <ShortcutsTabLabel count={shortcutCount} />
          </Tabs.Tab>
          <Tabs.Indicator className="workspace-indicator" />
        </Tabs.List>
        <Tabs.Panel value="edit" keepMounted className="workspace-panel">
          <Chat
            active={active && view === 'edit'}
            tab={tab}
            aiBlocked={sensitiveReason(tab.url)}
            onSaved={() => setView('rules')}
          />
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
        <Tabs.Panel value="shortcuts" className="workspace-panel">
          <ShortcutsTab tab={tab} />
        </Tabs.Panel>
      </Tabs.Root>
    </>
  );
}

export function App() {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const tab = useActiveTab();
  const { appearance, toggleAppearance } = useAppearance();
  const onboarding = useOnboarding();
  // Pendant la visite, sans page web, le panneau montre un site fictif pour présenter ses zones.
  const siteTab = tab?.host ? tab : onboarding.active ? DEMO_TAB : null;
  return (
    <MotionConfig reducedMotion="user">
      <ThemeBackground appearance={appearance} />
      <main className="app-shell" inert={onboarding.active}>
        <header className="app-header">
          <Brand appearance={appearance} data-tour="brand" />
          <div className="header-actions">
            <button
              type="button"
              className="icon-button"
              data-tour="theme"
              aria-label={appearance === 'light' ? 'Turn on dark mode' : 'Turn on light mode'}
              title={appearance === 'light' ? 'Dark mode' : 'Light mode'}
              onClick={toggleAppearance}
            >
              {appearance === 'light' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
            </button>
            <button
              type="button"
              className="icon-button"
              data-tour="options"
              aria-label={optionsOpen ? 'Back to the site' : 'Options'}
              title={optionsOpen ? 'Back to the site' : 'Options'}
              aria-expanded={optionsOpen}
              aria-controls="panel-options"
              onClick={() => setOptionsOpen(!optionsOpen)}
            >
              {optionsOpen ? <ArrowLeftIcon size={19} /> : <GearSixIcon size={19} />}
            </button>
          </div>
        </header>
        <div id="panel-options" hidden={!optionsOpen}>
          {optionsOpen && <OptionsContent onReplayOnboarding={() => setOptionsOpen(false)} />}
        </div>
        <div className="panel-site" hidden={optionsOpen}>
          {siteTab ? (
            <Site
              key={`${siteTab.id}:${siteTab.host}`}
              tab={siteTab}
              active={!optionsOpen && siteTab !== DEMO_TAB}
            />
          ) : (
            <section className="empty-page">
              <AssemblyDiagram />
              <p className="eyebrow">Ready to adjust</p>
              <h1>A page made to measure.</h1>
              <p data-testid="host">Open a web page (http or https) to modify it.</p>
            </section>
          )}
        </div>
      </main>
      <Onboarding
        phase={onboarding.phase}
        appearance={appearance}
        onIntroDone={onboarding.startTour}
        onFinish={onboarding.finish}
      />
    </MotionConfig>
  );
}
