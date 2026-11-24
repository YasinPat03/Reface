// Skills : connaissances écrites à l'avance, données au LLM (service worker uniquement).
// - Skill de site : choisi par l'hôte, sa prose va dans le prompt système (stable par site, donc
//   compatible avec le cache de prompt) et ses composants sont vérifiés sur la page vivante.
// - Skill de technique : choisi par les mots de la demande (ou chargé par l'outil load_skill).
import { matchesHost, mentions, parseSkill, type Skill } from './skillFormat';
import type { Probe } from './types';

/** Budgets (caractères) : le contexte du LLM reste dominé par la page, pas par les fiches. */
export const SITE_SKILL_BUDGET = 2_500;
export const TECHNIQUE_SKILL_BUDGET = 1_500;
export const INJECTED_SKILLS_BUDGET = 4_500;

const files = import.meta.glob('../skills/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const SKILLS: readonly Skill[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, raw]) => parseSkill(raw, path));

export const SKILL_NAMES = SKILLS.map((skill) => skill.name);

export function skillByName(name: string): Skill | null {
  return SKILLS.find((skill) => skill.name === name) ?? null;
}

export function siteSkill(host: string): Skill | null {
  return SKILLS.find((skill) => skill.kind === 'site' && matchesHost(skill, host)) ?? null;
}

/** Techniques dont un déclencheur figure dans la demande, dans l'ordre des fichiers. */
export function techniqueSkills(prompt: string, max = 2): Skill[] {
  return SKILLS.filter((skill) => skill.kind === 'technique' && skill.triggers?.test(prompt)).slice(
    0,
    max,
  );
}

/** Catalogue (nom + une ligne) pour l'outil load_skill. */
export function skillCatalog(): string {
  return SKILLS.filter((skill) => skill.kind === 'technique')
    .map((skill) => `- ${skill.name}: ${skill.description}`)
    .join('\n');
}

/** Texte d'un skill, tronqué à son budget. */
export function skillText(skill: Skill): string {
  const budget = skill.kind === 'site' ? SITE_SKILL_BUDGET : TECHNIQUE_SKILL_BUDGET;
  const body = skill.body.length > budget ? `${skill.body.slice(0, budget - 1)}…` : skill.body;
  return `<skill name="${skill.name}">\n${body}\n</skill>`;
}

/**
 * Composants à vérifier sur la page : ceux que la demande cite (alias, nom) sont marqués `asked`.
 * Le content script garde ceux qui visent quelque chose (`content/components.ts`).
 */
export function componentProbes(skill: Skill | null, prompt: string): Probe[] {
  return (skill?.components ?? []).map((component) => ({
    name: component.name,
    selectors: component.selectors,
    all: component.all,
    asked: [component.name, ...component.aliases].some((alias) => mentions(prompt, alias)),
  }));
}
