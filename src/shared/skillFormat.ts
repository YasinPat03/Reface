// Format des skills (src/skills/**/*.md) : fiches écrites à la main, données au LLM.
// Pur et sans import : les scripts Node (tests/e2e/skills-check.ts) l'importent tel quel.
//
// ---
// name: youtube
// kind: site                      (site | technique)
// hosts: youtube.com              (site : domaines, sous-domaines compris)
// triggers: \b(?:dark|sombre)\b   (technique : regex, insensible à la casse)
// description: Une ligne, pour le catalogue.
// verify: https://… https://…     (site : URLs du contrôle sur le vrai site)
// ---
// Prose (types de pages, pièges)…
//
// ```components
// Nom | alias, autre alias | sélecteur ; sélecteur alternatif | one|all
// ```

export interface SkillComponent {
  name: string;
  /** Mots que l'utilisateur emploie pour ce composant (FR/EN), en minuscules. */
  aliases: string[];
  /** Sélecteurs alternatifs : le 1er qui vise un élément visible est retenu. */
  selectors: string[];
  /** `all` : un élément répété (cartes, lignes), à viser en entier. */
  all: boolean;
}

export interface Skill {
  name: string;
  kind: 'site' | 'technique';
  hosts: string[];
  triggers: RegExp | null;
  description: string;
  verify: string[];
  /** Prose, sans le bloc `components`. */
  body: string;
  components: SkillComponent[];
}

const FRONT = /^---\n([\s\S]*?)\n---\n?/;
const COMPONENTS = /```components\n([\s\S]*?)```\n?/;

/** Découpe sur `sep` hors parenthèses, crochets et guillemets (`:is(a, b)` reste entier). */
export function splitOutside(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0 && text.startsWith(sep, i)) {
      out.push(current);
      current = '';
      i += sep.length - 1;
      continue;
    }
    current += c;
  }
  out.push(current);
  return out.map((part) => part.trim()).filter(Boolean);
}

function parseComponent(line: string, file: string): SkillComponent {
  const cells = line.split('|').map((cell) => cell.trim());
  if (cells.length !== 4) throw new Error(`${file}: component line needs 4 cells: ${line}`);
  const [name, aliases, selectors, scope] = cells as [string, string, string, string];
  if (scope !== 'one' && scope !== 'all')
    throw new Error(`${file}: scope must be one|all: ${line}`);
  const parsed = splitOutside(selectors, ';');
  if (!name || !parsed.length) throw new Error(`${file}: empty component: ${line}`);
  return {
    name,
    aliases: aliases
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean),
    selectors: parsed,
    all: scope === 'all',
  };
}

export function parseSkill(raw: string, file = 'skill'): Skill {
  const text = raw.replace(/\r\n/g, '\n');
  const front = FRONT.exec(text);
  if (!front) throw new Error(`${file}: missing front matter`);
  const meta: Record<string, string> = {};
  for (const line of front[1]!.split('\n')) {
    const match = /^([a-z]+):\s*(.*)$/.exec(line.trim());
    if (match) meta[match[1]!] = match[2]!.trim();
  }
  const kind = meta.kind;
  if (kind !== 'site' && kind !== 'technique')
    throw new Error(`${file}: kind must be site|technique`);
  if (!meta.name || !/^[a-z0-9-]+$/.test(meta.name)) throw new Error(`${file}: invalid name`);
  const rest = text.slice(front[0].length);
  const block = COMPONENTS.exec(rest);
  const components = (block?.[1] ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => parseComponent(line, file));
  return {
    name: meta.name,
    kind,
    hosts: (meta.hosts ?? '')
      .split(/[\s,]+/)
      .map((h) => h.toLowerCase())
      .filter(Boolean),
    triggers: meta.triggers ? new RegExp(meta.triggers, 'i') : null,
    description: meta.description ?? '',
    verify: (meta.verify ?? '').split(/\s+/).filter(Boolean),
    body: rest.replace(COMPONENTS, '').trim(),
    components,
  };
}

/** Le skill vaut-il pour cet hôte ? `youtube.com` couvre `www.youtube.com` et `m.youtube.com`. */
export function matchesHost(skill: Skill, host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return skill.hosts.some((domain) => h === domain || h.endsWith(`.${domain}`));
}

/** Minuscules, sans accents ni apostrophes typographiques : « Vidéos courtes » ~ « videos courtes ». */
export function normalizeWords(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").toLowerCase();
}

/** Un alias est-il cité dans la demande (mot entier, accents ignorés, pluriel en s/x accepté) ? */
export function mentions(prompt: string, alias: string): boolean {
  const words = normalizeWords(prompt);
  const needle = normalizeWords(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${needle}(?:e?s|x)?(?:$|[^\\p{L}\\p{N}])`, 'u').test(
    words,
  );
}
