// Health check (PRD M9, §5.3) : à document_idle + ~1,5 s, vérifie que les éléments visés par
// chaque règle existent encore. Sinon la règle passe « suspecte » (badge « cassée » dans le panel).
import { getSiteRules, setSiteRules } from '../shared/storage';
import type { Rule, Target } from '../shared/types';

const FIRST_CHECK_MS = 1_500;
/** Seconde chance pour le contenu chargé tardivement (lazy loading, SPA). */
const RECHECK_MS = 3_500;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Gabarit de chemin : les segments qui ressemblent à des identifiants deviennent « * ». */
export function pathTemplate(path: string): string {
  return path
    .split('/')
    .map((segment) => (/\d{3,}|^[0-9a-f-]{16,}$|^.{40,}$/i.test(segment) ? '*' : segment))
    .join('/')
    .replace(/\/+$/, '');
}

function targetFound(target: Target): boolean {
  return target.selectors.some((selector) => {
    try {
      return document.querySelectorAll(selector).length >= Math.max(1, target.minMatches);
    } catch {
      return false;
    }
  });
}

function ruleFound(rule: Rule): boolean {
  return Object.values(rule.targets).every(targetFound);
}

/** Règles concernées par la page courante (activées, avec cibles, même gabarit de page). */
function applicable(rules: Rule[]): Rule[] {
  const here = pathTemplate(location.pathname);
  return rules.filter(
    (rule) =>
      rule.enabled &&
      Object.keys(rule.targets).length > 0 &&
      (rule.pagePath === undefined || pathTemplate(rule.pagePath) === here),
  );
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function checkHealth(
  recheckDelay = RECHECK_MS,
): Promise<{ checked: number; suspect: number }> {
  const host = location.hostname;
  const rules = applicable((await getSiteRules(host)).rules);
  if (!rules.length) return { checked: 0, suspect: 0 };

  let failing = rules.filter((rule) => !ruleFound(rule));
  if (failing.length && recheckDelay > 0) {
    await wait(recheckDelay);
    failing = failing.filter((rule) => !ruleFound(rule));
  }
  const failed = new Set(failing.map((r) => r.id));

  // Écriture minimale : seulement si l'état change (ou lastOk vieux de plus d'un jour).
  const now = new Date();
  const patches = new Map<string, Rule['health']>();
  for (const rule of rules) {
    const h = rule.health;
    if (failed.has(rule.id)) {
      patches.set(rule.id, { ...h, failures: h.failures + 1, status: 'suspect' });
    } else if (
      h.status !== 'ok' ||
      h.failures > 0 ||
      !h.lastOk ||
      now.getTime() - Date.parse(h.lastOk) > DAY_MS
    ) {
      patches.set(rule.id, { lastOk: now.toISOString(), failures: 0, status: 'ok' });
    }
  }
  if (patches.size) {
    // Relecture juste avant l'écriture, pour ne pas écraser une modification faite entre-temps.
    const fresh = await getSiteRules(host);
    await setSiteRules({
      ...fresh,
      rules: fresh.rules.map((r) => (patches.has(r.id) ? { ...r, health: patches.get(r.id)! } : r)),
    });
  }
  return { checked: rules.length, suspect: failed.size };
}

export function scheduleHealthCheck(): void {
  setTimeout(() => void checkHealth().catch(() => null), FIRST_CHECK_MS);
}
