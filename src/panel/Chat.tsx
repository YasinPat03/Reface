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
import type { Draft, PickResult } from '../shared/types';
import { errorMessage, type ActiveTab } from './tab';
import { AssemblyDiagram } from './ui';

type Status = 'idle' | 'generating' | 'saving' | 'picking';

const EXAMPLES = ['Cache les commentaires', 'Texte plus grand et plus aéré'];

export function Chat({
  tab,
  aiBlocked = null,
  onSaved,
}: {
  tab: ActiveTab;
  /** Raison pour laquelle l'IA est désactivée sur ce site (deny-list), ou null. */
  aiBlocked?: string | null;
  onSaved?: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickResult | null>(null);
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
  // Un picker encore actif dans la page est annulé si le panel change de site.
  useEffect(() => () => void callContent(tab.id, 'cancelPick', {}).catch(() => null), [tab.id]);

  async function startPick() {
    if (status === 'picking') {
      await callContent(tab.id, 'cancelPick', {}).catch(() => null);
      return;
    }
    setStatus('picking');
    setError(null);
    setNotice(null);
    try {
      const result = await callContent(tab.id, 'pick', {});
      if (result) setPicked(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStatus('idle');
    }
  }

  async function hidePicked() {
    if (!picked) return;
    setStatus('saving');
    setError(null);
    try {
      await callBg('quickHide', { tabId: tab.id, pick: picked });
      setPicked(null);
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
        pick: picked?.selector ?? null,
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
      setPicked(null);
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
    <section className="editor" aria-label="Éditeur de page">
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
                disabled={busy || !draft.previewCss.trim()}
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
          onClick={startPick}
          disabled={status === 'generating' || status === 'saving'}
          aria-pressed={status === 'picking'}
          className="pick-button"
        >
          <span className="pick-crosshair">
            <CrosshairSimpleIcon size={21} weight="light" aria-hidden="true" />
          </span>
          <span>{status === 'picking' ? 'Annuler le pointage' : 'Pointer un élément'}</span>
          <span className="pick-indicator" aria-hidden="true">
            {status === 'picking' ? '−' : '+'}
          </span>
        </button>
        {status === 'picking' && (
          <p role="status" className="picking-instructions">
            Cliquez sur un élément de la page. ↑ pour sélectionner son parent, Échap pour annuler.
          </p>
        )}
        <AnimatePresence initial={false}>
          {picked && (
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
                <span className="eyebrow">Élément sélectionné</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Oublier l’élément pointé"
                  onClick={() => setPicked(null)}
                  disabled={busy}
                >
                  <XIcon size={16} aria-hidden="true" />
                </button>
              </div>
              <p className="target-label" title={picked.selector}>
                {picked.label}
              </p>
              <button type="button" onClick={hidePicked} disabled={busy} className="text-button">
                <EyeSlashIcon size={16} aria-hidden="true" />
                Cacher cet élément
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="prompt-field">
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
