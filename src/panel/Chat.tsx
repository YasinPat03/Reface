import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { ArrowElbowDownLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowElbowDownLeft';
import { CrosshairSimpleIcon } from '@phosphor-icons/react/dist/csr/CrosshairSimple';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { EyeSlashIcon } from '@phosphor-icons/react/dist/csr/EyeSlash';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { LockSimpleIcon } from '@phosphor-icons/react/dist/csr/LockSimple';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { callBg, callContent } from '../shared/messages';
import {
  MAX_PICKED_ELEMENTS,
  PICKER_PORT,
  type PickerCommand,
  type PickerEvent,
} from '../shared/picker';
import type { Draft, PickResult } from '../shared/types';
import { errorMessage, type ActiveTab } from './tab';
import { AssemblyDiagram } from './ui';

type Status = 'idle' | 'generating' | 'saving' | 'picking';

const NO_PICKS: PickResult[] = [];
const EXAMPLES = ['Cache les commentaires', 'Texte plus grand et plus aéré'];

export function Chat({
  tab,
  aiBlocked = null,
  active = true,
  onSaved,
}: {
  tab: ActiveTab;
  /** Raison pour laquelle l'IA est désactivée sur ce site (deny-list), ou null. */
  aiBlocked?: string | null;
  active?: boolean;
  onSaved?: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ url: string; items: PickResult[] } | null>(null);
  const picked = selection?.url === tab.url ? selection.items : NO_PICKS;
  const selectionPort = useRef<chrome.runtime.Port | null>(null);
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
  useEffect(() => {
    if (!active) return;
    const port = chrome.tabs.connect(tab.id, { name: PICKER_PORT, frameId: 0 });
    selectionPort.current = port;
    port.onMessage.addListener((event: PickerEvent) => {
      if (selectionPort.current !== port) return;
      if (event.type === 'stopped') {
        setStatus((current) => (current === 'picking' ? 'idle' : current));
        return;
      }
      setSelection((current) => {
        const items = current?.url === tab.url ? current.items : NO_PICKS;
        if (items.some(({ selector }) => selector === event.result.selector)) return current;
        return { url: tab.url, items: [...items, event.result].slice(0, MAX_PICKED_ELEMENTS) };
      });
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      if (selectionPort.current !== port) return;
      selectionPort.current = null;
      setStatus((current) => (current === 'picking' ? 'idle' : current));
    });
    return () => {
      if (selectionPort.current === port) selectionPort.current = null;
      port.disconnect();
      setStatus((current) => (current === 'picking' ? 'idle' : current));
    };
  }, [active, tab.id, tab.url]);

  useEffect(() => {
    if (active) {
      selectionPort.current?.postMessage({
        type: 'highlight',
        selectors: picked.map(({ selector }) => selector),
      } satisfies PickerCommand);
    }
  }, [active, picked, tab.id, tab.url]);

  function togglePicker() {
    const port = selectionPort.current;
    if (!port) {
      setError('Le pointeur est indisponible. Rechargez la page pour réessayer.');
      return;
    }
    const stopping = status === 'picking';
    setError(null);
    setNotice(null);
    try {
      port.postMessage({ type: stopping ? 'stop' : 'start' } satisfies PickerCommand);
      if (!stopping) setStatus('picking');
    } catch (error) {
      setStatus('idle');
      setError(errorMessage(error));
    }
  }

  function removePicked(selector: string) {
    setSelection({ url: tab.url, items: picked.filter((item) => item.selector !== selector) });
  }

  async function hidePicked(item: PickResult) {
    setStatus('saving');
    setError(null);
    try {
      await callBg('quickHide', { tabId: tab.id, pick: item });
      removePicked(item.selector);
      onSaved?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStatus('idle');
    }
  }

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
        pick: picked.map(({ selector }) => selector),
      });
      // Panel neuf + service worker resté à l'ancienne version (dist/ recompilé sans ↻).
      if (!Array.isArray(next?.changes)) {
        throw new Error(
          'ReFace a été mis à jour : rechargez l’extension (↻ dans chrome://extensions), puis l’onglet.',
        );
      }
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
      setSelection(null);
      const kept = draft.changes.filter((c) => c.enabled).length;
      setNotice(
        kept > 1
          ? `${kept} modifications enregistrées. Elles reviendront à chaque visite.`
          : 'Modification enregistrée. Elle reviendra à chaque visite.',
      );
      onSaved?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStatus('idle');
    }
  }

  /** Coche/décoche un changement : la preview est mise à jour en direct dans la page. */
  async function toggleChange(index: number, enabled: boolean) {
    if (!draft || draftTab.current === null) return;
    const changes = draft.changes.map((c, i) => (i === index ? { ...c, enabled } : c));
    setDraft({ ...draft, changes });
    try {
      const { previewCss } = await callContent(draftTab.current, 'updatePreview', { changes });
      setDraft((current) => (current ? { ...current, changes, previewCss } : current));
    } catch (e) {
      setError(errorMessage(e));
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
    <section
      className="editor"
      aria-label="Éditeur de page"
      onKeyDown={(event) => {
        if (status === 'picking' && (event.key === 'Enter' || event.key === 'Escape')) {
          event.preventDefault();
          if (!event.repeat) togglePicker();
        }
      }}
    >
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">{draft ? 'Aperçu' : 'Ajustement'}</p>
          <h2>{draft ? 'Affiner la modification' : 'Que voulez-vous changer ?'}</h2>
        </div>
        <AssemblyDiagram
          phase={
            status === 'generating'
              ? 'working'
              : status === 'picking'
                ? 'picking'
                : draft
                  ? 'preview'
                  : notice
                    ? 'saved'
                    : 'idle'
          }
        />
      </div>
      {!draft && <p className="workspace-description">Essayez sur la page avant de garder.</p>}
      {aiBlocked && (
        <p data-testid="ai-blocked" className="message message-caution">
          <LockSimpleIcon size={18} aria-hidden="true" />
          <span>
            {aiBlocked} L’IA est désactivée ici : aucun contenu n’est envoyé. Vous pouvez quand même
            pointer un élément pour le cacher.
          </span>
        </p>
      )}

      <AnimatePresence initial={false}>
        {draft && (
          <motion.div
            key="draft"
            data-testid="draft"
            className="draft-sheet"
            role="region"
            aria-label="Aperçu de la modification"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22 }}
          >
            <div className="draft-caption">
              <span className="draft-light" />
              <span>Aperçu sur la page</span>
              <span className="draft-unsaved">Non enregistré</span>
            </div>
            <p className="draft-explanation">{draft.explanation || 'Modification prête.'}</p>
            {draft.changes.length > 1 && (
              <ul data-testid="draft-changes" className="draft-changes">
                {draft.changes.map((change, i) => (
                  <li key={`${i}-${change.title}`}>
                    <input
                      type="checkbox"
                      className="draft-change-toggle"
                      checked={change.enabled}
                      disabled={busy}
                      aria-label={change.title}
                      onChange={(event) => void toggleChange(i, event.target.checked)}
                    />
                    <span className={change.enabled ? '' : 'is-disabled'}>{change.title}</span>
                  </li>
                ))}
              </ul>
            )}
            {draft.warnings.map((w) => (
              <p key={w} className="draft-warning">
                <WarningCircleIcon size={16} aria-hidden="true" />
                <span>{w}</span>
              </p>
            ))}
            <div className="draft-actions">
              <button
                type="button"
                onClick={discardDraft}
                disabled={busy}
                className="button button-ghost"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={keepDraft}
                disabled={
                  busy ||
                  !draft.previewCss.trim() ||
                  !draft.changes.some((change) => change.enabled)
                }
                className="button button-primary"
              >
                <CheckIcon size={16} aria-hidden="true" />
                {status === 'saving' ? 'Enregistrement…' : 'Garder'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={submit} className="adjustment-form">
        <button
          type="button"
          onClick={togglePicker}
          disabled={
            status === 'generating' || status === 'saving' || picked.length >= MAX_PICKED_ELEMENTS
          }
          aria-pressed={status === 'picking'}
          className="pick-button"
          data-tour="pick"
        >
          <span className="pick-crosshair">
            <CrosshairSimpleIcon size={21} weight="light" aria-hidden="true" />
          </span>
          <span>{status === 'picking' ? 'Terminer la sélection' : 'Pointer un élément'}</span>
          <span className="pick-indicator" aria-hidden="true">
            {status === 'picking' ? '−' : '+'}
          </span>
        </button>
        {status === 'picking' && (
          <p role="status" className="picking-instructions">
            Cliquez pour ajouter un élément. ↑ et ↓ ajustent la cible. Espace l’ajoute, Entrée
            termine.
          </p>
        )}
        <AnimatePresence initial={false}>
          {picked.length > 0 && (
            <motion.div
              key="picked"
              data-testid="picked"
              className="target-field"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div className="target-heading">
                <span className="eyebrow">
                  {picked.length === 1
                    ? 'Élément sélectionné'
                    : `${picked.length} éléments sélectionnés`}
                </span>
                {picked.length > 1 && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setSelection(null)}
                    disabled={busy}
                  >
                    Tout retirer
                  </button>
                )}
              </div>
              <ol className="target-list">
                {picked.map((item, index) => (
                  <li className="target-row" key={item.selector}>
                    <span className="target-index" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="target-label" title={item.selector}>
                      {item.label}
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      title="Cacher cet élément"
                      aria-label={`Cacher cet élément : ${item.label}`}
                      onClick={() => void hidePicked(item)}
                      disabled={busy}
                    >
                      <EyeSlashIcon size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title="Retirer de la sélection"
                      aria-label={`Retirer de la sélection : ${item.label}`}
                      onClick={() => removePicked(item.selector)}
                      disabled={busy}
                    >
                      <XIcon size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
              {picked.length >= MAX_PICKED_ELEMENTS && (
                <p className="picking-instructions">
                  Limite de {MAX_PICKED_ELEMENTS} éléments atteinte.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="prompt-field" data-tour="prompt">
          <label htmlFor="bp-prompt" className="sr-only">
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
            rows={4}
            placeholder={
              draft
                ? 'Ex. : un peu plus grand'
                : 'Ex. : agrandir les vignettes, masquer les commentaires…'
            }
            className="prompt-input"
            disabled={busy || !!aiBlocked}
          />
          <div className="input-hint">
            <ArrowElbowDownLeftIcon size={13} aria-hidden="true" />
            <span>Entrée pour prévisualiser</span>
          </div>
        </div>
        <button
          type="submit"
          disabled={busy || !prompt.trim() || !!aiBlocked}
          className="button button-primary preview-button"
        >
          <span>
            {status === 'generating'
              ? 'Préparation de l’aperçu…'
              : draft
                ? 'Réviser'
                : 'Prévisualiser'}
          </span>
          <ArrowRightIcon size={18} weight="regular" aria-hidden="true" />
        </button>
        {status === 'generating' && (
          <p role="status" className="working-note">
            Préparation de votre modification. Vous pourrez la vérifier avant de la garder.
          </p>
        )}
      </form>
      {!draft && !prompt && !aiBlocked && (
        <div className="suggestions" aria-label="Idées de modifications">
          <p className="eyebrow">Quelques idées</p>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              disabled={busy}
              className="suggestion"
            >
              <span>{example}</span>
              <ArrowRightIcon size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="message message-error">
          <WarningCircleIcon size={18} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      <AnimatePresence>
        {notice && (
          <motion.p
            role="status"
            className="message message-success"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <CheckIcon size={18} aria-hidden="true" />
            <span>{notice}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}
