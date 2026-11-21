import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/ui.css';

// Formulaire complet (clé API, base URL, modèle, test) en phase 3.1.
function Options() {
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-xl font-semibold">Browser Paint · Options</h1>
      <p className="mt-2 text-sm text-zinc-500">Configuration du LLM : à venir (phase 3).</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Options />
  </StrictMode>,
);
