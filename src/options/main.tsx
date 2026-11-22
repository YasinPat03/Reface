import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MoonIcon } from '@phosphor-icons/react/dist/csr/Moon';
import { SunIcon } from '@phosphor-icons/react/dist/csr/Sun';
import '../shared/ui.css';
import { ThemeBackground } from '../shared/ThemeBackground';
import { Brand } from '../shared/Brand';
import { useAppearance } from '../shared/appearance';

import { OptionsContent } from './OptionsContent';

function Options() {
  const { appearance, toggleAppearance } = useAppearance();
  return (
    <>
      <ThemeBackground appearance={appearance} />
      <main className="options-shell">
        <header className="app-header">
          <Brand appearance={appearance} />
          <button
            type="button"
            className="icon-button"
            aria-label={appearance === 'light' ? 'Activer le mode sombre' : 'Activer le mode clair'}
            title={appearance === 'light' ? 'Mode sombre' : 'Mode clair'}
            onClick={toggleAppearance}
          >
            {appearance === 'light' ? <MoonIcon size={19} /> : <SunIcon size={19} />}
          </button>
        </header>
        <OptionsContent />
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Options />
  </StrictMode>,
);
