import { sectionOf } from '../shared/section';
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { TrashSimpleIcon } from '@phosphor-icons/react/dist/csr/TrashSimple';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { removeRule, updateRule } from '../shared/rules';
import type { SiteRules } from '../shared/types';
import { errorMessage } from './tab';
import { Switch } from './ui';

export function Rules({ site, onCatalogue }: { site: SiteRules; onCatalogue: () => void }) {
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) =>
    fn().catch((e) => setMessage({ kind: 'error', text: errorMessage(e) }));

  return (
    <section className="rules-workspace" aria-label="Modifications enregistrées">
      <header className="rules-heading">
        <p className="eyebrow">Sur ce site</p>
        <h2>Vos modifications.</h2>
        <p className="rules-description">Activez, ajustez ou retirez ce que vous avez gardé.</p>
      </header>
      {site.rules.length === 0 ? (
        <p className="rules-empty">Aucune modification enregistrée sur ce site.</p>
      ) : (
        <ul className="rule-list" data-testid="rules">
          {site.rules.map((rule) => (
            <motion.li
              key={rule.id}
              layout
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`rule ${rule.health.status === 'suspect' ? 'is-suspect' : ''}`}
            >
              <div className="rule-main">
                <Switch
                  checked={rule.enabled}
                  label={
                    rule.enabled ? 'Désactiver cette modification' : 'Activer cette modification'
                  }
                  onChange={(enabled) => run(() => updateRule(site.host, rule.id, { enabled }))}
                />
                <button
                  type="button"
                  onClick={() => setOpen(open === rule.id ? null : rule.id)}
                  aria-expanded={open === rule.id}
                  className={`rule-title ${rule.enabled ? '' : 'is-disabled'}`}
                >
                  {rule.title ?? rule.prompt}
                  {rule.health.status === 'suspect' && (
                    <span
                      className="health-label"
                      title="Les éléments visés sont introuvables : le site a peut-être changé."
                    >
                      <WarningCircleIcon size={13} aria-hidden="true" />
                      cassée
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="rule-scope"
                  data-testid="rule-scope"
                  disabled={rule.scope === 'page'}
                  title={
                    rule.scope === 'page'
                      ? 'Thème du Catalogue : cette page uniquement.'
                      : 'Changer la portée : ce type de page ou tout le site.'
                  }
                  onClick={() =>
                    run(() =>
                      updateRule(site.host, rule.id, {
                        section: rule.section ? null : sectionOf(rule.pagePath ?? '/'),
                      }),
                    )
                  }
                >
                  {rule.scope === 'page'
                    ? 'cette page'
                    : rule.section
                      ? `/${rule.section === 'home' ? '' : rule.section}`
                      : 'tout le site'}
                </button>
                <button
                  type="button"
                  aria-label="Supprimer cette modification"
                  title="Supprimer"
                  onClick={() => run(() => removeRule(site.host, rule.id))}
                  className="icon-button"
                >
                  <TrashSimpleIcon size={16} aria-hidden="true" />
                </button>
              </div>
              <AnimatePresence initial={false}>
                {open === rule.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="rule-details">
                      {rule.title ? (
                        <p>Prompt d’origine : « {rule.prompt} »</p>
                      ) : (
                        rule.explanation && <p>{rule.explanation}</p>
                      )}
                      <p>Créée le {new Date(rule.createdAt).toLocaleString('fr-CA')}</p>
                      <p className="rule-selector">
                        {Object.values(rule.targets)
                          .map((t) => t.selectors[0])
                          .filter(Boolean)
                          .join(' · ') || 'Page entière'}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          ))}
        </ul>
      )}
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`message ${message.kind === 'error' ? 'message-error' : 'message-success'}`}
        >
          {message.kind === 'error' ? (
            <WarningCircleIcon size={17} aria-hidden="true" />
          ) : (
            <CheckIcon size={17} aria-hidden="true" />
          )}
          <span>{message.text}</span>
        </p>
      )}
      <div className="rule-tools">
        <button
          type="button"
          className="button"
          disabled={!site.rules.some((rule) => rule.enabled)}
          onClick={onCatalogue}
        >
          Enregistrer cette page
        </button>
      </div>
    </section>
  );
}
