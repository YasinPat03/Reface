import { useEffect, useRef, useState } from 'react';
import { callBg } from '../shared/messages';
import type { Draft } from '../shared/types';
import { errorMessage, type ActiveTab } from './tab';

type Status = 'idle' | 'generating' | 'saving';

const EXAMPLES = [
  'Cache les commentaires',
  'Texte plus grand et plus aéré',
  'Mode sombre',
  'Cache la barre latérale',
];

export function Chat({ tab, onSaved }: { tab: ActiveTab; onSaved?: () => void }) {
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const draftTab = useRef<number | null>(null);

  // Le composant est remonté à chaque changement de site (key={host}) :
  // au démontage, on retire une éventuelle preview restée sur l'ancien onglet.
  const pending = useRef<Draft | null>(null);
  useEffect(() => {
    pending.current = draft;
  }, [draft]);
  useEffect(
    () => () => {
      if (pending.current && draftTab.current !== null) {
        void callBg('discard', { tabId: draftTab.current }).catch(() => null);
      }
    },
    [],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || status !== 'idle') return;
    setStatus('generating');
    setError(null);
    setNotice(null);
    try {
      const next = await callBg('generate', {
        tabId: tab.id,
        prompt,
        previous: draft,
        pick: null,
      });
      draftTab.current = tab.id;
      setDraft(next);
      setPrompt('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStatus('idle');
    }
  }

  async function keepDraft() {
    if (!draft || draftTab.current === null) return;
    setStatus('saving');
    setError(null);
    try {
      await callBg('keep', { tabId: draftTab.current, draft });
      setDraft(null);
      setNotice('Modification enregistrée. Elle reviendra à chaque visite.');
      onSaved?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStatus('idle');
    }
  }

  async function discardDraft() {
    if (draftTab.current !== null) {
      await callBg('discard', { tabId: draftTab.current }).catch(() => null);
    }
    setDraft(null);
    setError(null);
  }

  const busy = status !== 'idle';

  return (
    <section className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor="bp-prompt" className="text-sm font-medium">
          {draft ? 'Affiner la modification' : 'Que voulez-vous changer ?'}
        </label>
        <textarea
          id="bp-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={3}
          placeholder={draft ? 'Ex. : un peu plus grand' : 'Ex. : cache les commentaires'}
          className="resize-none rounded-md border border-zinc-300 bg-transparent p-2 text-sm outline-none focus:border-violet-500 dark:border-zinc-700"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !prompt.trim()}
          className="self-end rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {status === 'generating' ? 'Génération…' : draft ? 'Réviser' : 'Prévisualiser'}
        </button>
      </form>

      {!draft && !prompt && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-violet-400 hover:text-violet-700 dark:border-zinc-800 dark:text-zinc-400"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}

      {draft && (
        <div
          data-testid="draft"
          className="flex flex-col gap-2 rounded-lg border border-violet-300 p-3 dark:border-violet-800"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Preview</p>
          <p className="text-sm">{draft.explanation || 'Modification prête.'}</p>
          {draft.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-700 dark:text-amber-400">
              ⚠️ {w}
            </p>
          ))}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={discardDraft}
              disabled={busy}
              className="rounded-md px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={keepDraft}
              disabled={busy || !draft.previewCss.trim()}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {status === 'saving' ? 'Enregistrement…' : 'Garder'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
