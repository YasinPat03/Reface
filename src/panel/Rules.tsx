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
    <section className="rules-workspace" aria-label="Saved changes">
      <header className="rules-heading">
        <p className="eyebrow">On this site</p>
        <h2>Your changes.</h2>
        <p className="rules-description">Turn on, adjust or remove what you’ve kept.</p>
      </header>
      {site.rules.length === 0 ? (
        <p className="rules-empty">No saved changes on this site.</p>
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
                  label={rule.enabled ? 'Turn off this change' : 'Turn on this change'}
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
                      title="The targeted elements can’t be found: the site may have changed."
                    >
                      <WarningCircleIcon size={13} aria-hidden="true" />
                      broken
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
                      ? 'Catalogue theme: this page only.'
                      : 'Change the scope: this type of page or the whole site.'
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
                    ? 'this page'
                    : rule.section
                      ? `/${rule.section === 'home' ? '' : rule.section}`
                      : 'whole site'}
                </button>
                <button
                  type="button"
                  aria-label="Delete this change"
                  title="Delete"
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
                        <p>Original prompt: “{rule.prompt}”</p>
                      ) : (
                        rule.explanation && <p>{rule.explanation}</p>
                      )}
                      <p>Created {new Date(rule.createdAt).toLocaleString('en-US')}</p>
                      <p className="rule-selector">
                        {Object.values(rule.targets)
                          .map((t) => t.selectors[0])
                          .filter(Boolean)
                          .join(' · ') || 'Whole page'}
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
          Save this page
        </button>
      </div>
    </section>
  );
}
