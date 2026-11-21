import { useRef, useState } from 'react';
import { callContent } from '../shared/messages';
import { getAllSites, importSites, removeRule, updateRule } from '../shared/rules';
import { makeExport, parseExport } from '../shared/ruleSchema';
import { sectionOf } from '../shared/section';
import type { SiteRules } from '../shared/types';
import { errorMessage } from './tab';
import { Switch } from './ui';

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Rules({ site, tabId }: { site: SiteRules; tabId: number }) {
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const run = (fn: () => Promise<unknown>) =>
    fn().catch((e) => setMessage({ kind: 'error', text: errorMessage(e) }));

  async function onImport(file: File) {
    try {
      const sites = parseExport(JSON.parse(await file.text()));
      const count = await importSites(sites);
      setMessage({
        kind: 'ok',
        text: `${count} règle(s) importée(s) sur ${sites.length} site(s).`,
      });
    } catch (e) {
      setMessage({
        kind: 'error',
        text: e instanceof SyntaxError ? 'Ce fichier n’est pas du JSON valide.' : errorMessage(e),
      });
    }
  }

  return (
    <section className="flex flex-col gap-3">
      {site.rules.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucune modification enregistrée sur ce site.</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="rules">
          {site.rules.map((rule) => (
            <li
              key={rule.id}
              className={`rounded-lg border p-2.5 ${
                rule.health.status === 'suspect'
                  ? 'border-red-300 dark:border-red-900'
                  : 'border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <div className="flex items-start gap-2">
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
                  className={`min-w-0 flex-1 text-left text-sm ${rule.enabled ? '' : 'text-zinc-400'}`}
                >
                  <span className="line-clamp-2">{rule.title ?? rule.prompt}</span>
                </button>
                <button
                  type="button"
                  data-testid="rule-scope"
                  title={
                    rule.section
                      ? 'Appliquée aux pages de ce type. Cliquer pour l’appliquer à tout le site.'
                      : 'Appliquée à tout le site. Cliquer pour la limiter à ce type de page.'
                  }
                  onClick={() =>
                    run(() =>
                      updateRule(site.host, rule.id, {
                        section: rule.section ? null : sectionOf(rule.pagePath ?? '/'),
                      }),
                    )
                  }
                  className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 hover:bg-violet-100 hover:text-violet-700 dark:bg-zinc-800 dark:text-zinc-400"
                >
                  {rule.section
                    ? `/${rule.section === 'home' ? '' : rule.section}`
                    : 'tout le site'}
                </button>
                {rule.health.status === 'suspect' && (
                  <span
                    title="Les éléments visés sont introuvables : le site a peut-être changé."
                    className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300"
                  >
                    cassée
                  </span>
                )}
                <button
                  type="button"
                  aria-label="Supprimer cette modification"
                  title="Supprimer"
                  onClick={() => run(() => removeRule(site.host, rule.id))}
                  className="rounded px-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                >
                  ✕
                </button>
              </div>
              {open === rule.id && (
                <div className="mt-2 space-y-1 border-t border-zinc-100 pt-2 text-xs text-zinc-500 dark:border-zinc-800">
                  {rule.title ? (
                    <p>Prompt d’origine : « {rule.prompt} »</p>
                  ) : (
                    rule.explanation && <p>{rule.explanation}</p>
                  )}
                  <p>Créée le {new Date(rule.createdAt).toLocaleString('fr-CA')}</p>
                  <p className="break-all font-mono">
                    {Object.values(rule.targets)
                      .map((t) => t.selectors[0])
                      .filter(Boolean)
                      .join(' · ') || 'CSS libre'}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`text-sm ${message.kind === 'error' ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3 text-xs dark:border-zinc-800">
        <button
          type="button"
          disabled={!site.rules.length}
          onClick={() => download(`browser-paint-${site.host}.json`, makeExport([site]))}
          className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          Exporter ce site
        </button>
        <button
          type="button"
          onClick={() =>
            run(async () => download('browser-paint-tout.json', makeExport(await getAllSites())))
          }
          className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          Tout exporter
        </button>
        <button
          type="button"
          disabled={!site.rules.length}
          onClick={() =>
            run(async () => {
              const { checked, suspect } = await callContent(tabId, 'healthCheck', {});
              setMessage(
                checked === 0
                  ? { kind: 'ok', text: 'Aucune règle à vérifier sur cette page.' }
                  : suspect
                    ? {
                        kind: 'error',
                        text: `${suspect} règle(s) sur ${checked} ne trouvent plus leurs éléments.`,
                      }
                    : { kind: 'ok', text: `${checked} règle(s) vérifiée(s) : tout fonctionne.` },
              );
            })
          }
          className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          Vérifier
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          Importer…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="import"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImport(file);
            e.target.value = '';
          }}
        />
      </div>
    </section>
  );
}
