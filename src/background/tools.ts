// Outils proposés au LLM pendant la génération : tous en LECTURE SEULE sur la page (chercher,
// inspecter) ou sur nos propres guides (load_skill). Ni écriture, ni réseau, ni code : la sortie
// reste une recette validée. Les arguments sont revalidés ici (le mode strict ne garantit pas les
// appels parallèles), et une erreur est renvoyée au LLM comme résultat, sans casser le tour.
import { z } from 'zod';
import { callContent } from '../shared/messages';
import { sensitiveReason } from '../shared/sensitive';
import { SKILLS, skillByName, skillCatalog, skillText } from '../shared/skills';
import type { AgentStepCall } from '../shared/schema';
import type { InvestigateCall } from '../shared/types';
import type { ChatMessage, ToolCall, ToolSpec } from './llm';

/** Taille maximale d'un résultat, et de l'ensemble des résultats d'un tour (caractères). */
export const MAX_RESULT_CHARS = 2_500;
export const MAX_ROUND_CHARS = 6_000;

const findArgs = z.object({
  queries: z.array(z.string().max(120)).min(1),
  within: z.number().int(),
});
const inspectArgs = z.object({
  regions: z.array(z.number().int().min(0)).min(1),
  depth: z.number().int(),
});
const skillArgs = z.object({ name: z.string() });

const FIND_ELEMENTS: ToolSpec = {
  name: 'find_elements',
  description:
    'Search the live page for what the user names when it is not clearly in the outline, site components, design snapshot or media inventory (small buttons and badges, items beyond the first ones of a list, parts beyond the outline cap). Each query is matched as whole words against visible text, aria-label, title, alt, placeholder and id/class names, or tested as a CSS selector if it looks like one. Returns [#n] regions usable as regionIndex, with verified selectors and their meaningful ancestors.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['queries', 'within'],
    properties: {
      queries: {
        type: 'array',
        items: { type: 'string' },
        description:
          '1-4 short queries in the words the PAGE uses (translate the user words into the page language), or CSS selectors to test.',
      },
      within: {
        type: 'integer',
        description: 'Region [#n] to search inside, or -1 for the whole page.',
      },
    },
  },
};

const INSPECT_REGIONS: ToolSpec = {
  name: 'inspect_regions',
  description:
    'Look inside regions: their children deeper than the outline (small elements included, with new [#n]), layout (display, parent flex/grid, gap), size and size constraints (max-width, min-width, flex), colors and font, verified selectors. Use it before resizing, rearranging or restyling something whose inner structure you do not see.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['regions', 'depth'],
    properties: {
      regions: {
        type: 'array',
        items: { type: 'integer' },
        description: '1-3 region indexes [#n] from the outline, the components or a tool result.',
      },
      depth: { type: 'integer', description: 'Levels of children to list, 1 to 3.' },
    },
  },
};

/** Les outils du tour ; `load_skill` seulement s'il existe des guides de technique à charger. */
export function toolSpecs(): ToolSpec[] {
  const names = SKILLS.filter((skill) => skill.kind === 'technique').map((skill) => skill.name);
  if (!names.length) return [FIND_ELEMENTS, INSPECT_REGIONS];
  return [
    FIND_ELEMENTS,
    INSPECT_REGIONS,
    {
      name: 'load_skill',
      description: `Read a ReFace technique guide (how to do something well with this extension). Guides:\n${skillCatalog()}`,
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: { name: { type: 'string', enum: names } },
      },
    },
  ];
}

function truncate(text: string, max: number): string {
  return text.length > max
    ? `${text.slice(0, max - 40)}\n… (truncated, ask a narrower query)`
    : text;
}

type Parsed =
  | { id: string; kind: 'content'; call: InvestigateCall }
  | { id: string; kind: 'local'; text: string; label: string };

function parseCall(call: ToolCall): Parsed {
  let args: unknown;
  try {
    args = JSON.parse(call.function.arguments || '{}');
  } catch {
    return { id: call.id, kind: 'local', label: '', text: 'Error: arguments are not valid JSON.' };
  }
  const name = call.function.name;
  if (name === 'find_elements') {
    const parsed = findArgs.safeParse(args);
    if (!parsed.success)
      return {
        id: call.id,
        kind: 'local',
        label: '',
        text: 'Error: invalid find_elements arguments.',
      };
    return {
      id: call.id,
      kind: 'content',
      call: {
        tool: 'find_elements',
        queries: parsed.data.queries
          .map((q) => q.trim())
          .filter(Boolean)
          .slice(0, 4),
        within: Math.max(-1, parsed.data.within),
      },
    };
  }
  if (name === 'inspect_regions') {
    const parsed = inspectArgs.safeParse(args);
    if (!parsed.success)
      return {
        id: call.id,
        kind: 'local',
        label: '',
        text: 'Error: invalid inspect_regions arguments.',
      };
    return {
      id: call.id,
      kind: 'content',
      call: {
        tool: 'inspect_regions',
        regions: [...new Set(parsed.data.regions)].slice(0, 3),
        depth: Math.min(Math.max(parsed.data.depth, 1), 3),
      },
    };
  }
  if (name === 'load_skill') {
    const parsed = skillArgs.safeParse(args);
    const skill = parsed.success ? skillByName(parsed.data.name) : null;
    return skill && skill.kind === 'technique'
      ? {
          id: call.id,
          kind: 'local',
          label: `Reading the ${skill.name} guide…`,
          text: skillText(skill),
        }
      : { id: call.id, kind: 'local', label: '', text: 'Error: unknown guide.' };
  }
  return { id: call.id, kind: 'local', label: '', text: `Error: unknown tool "${name}".` };
}

/**
 * Exécute les appels d'un tour : un seul message au content script pour tous les outils de la
 * page, puis un message `tool` par appel (dans l'ordre), encadré comme donnée non fiable.
 */
export async function executeToolCalls(
  tabId: number,
  host: string,
  distillId: number,
  calls: ToolCall[],
  progress: (text: string) => void = () => {},
): Promise<ChatMessage[]> {
  // La page a pu changer d'adresse pendant l'appel au LLM : jamais d'examen d'un site sensible.
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url ?? '';
  if (sensitiveReason(url) || new URL(url || 'about:blank').hostname !== host) {
    throw new Error('The tab moved to another page during the change. Try again.');
  }
  const parsed = calls.map(parseCall);
  const content = parsed.filter(
    (p): p is Extract<Parsed, { kind: 'content' }> => p.kind === 'content',
  );
  for (const p of parsed) if (p.kind === 'local' && p.label) progress(p.label);
  const answers = content.length
    ? await callContent(tabId, 'investigate', { distillId, calls: content.map((p) => p.call) })
    : { stale: false, results: [] };
  answers.results.forEach((result) => progress(result.label));
  const byId = new Map(content.map((p, i) => [p.id, answers.results[i]?.text ?? 'No result.']));
  let budget = MAX_ROUND_CHARS;
  return parsed.map((p) => {
    const name = calls.find((call) => call.id === p.id)?.function.name ?? 'tool';
    const raw = p.kind === 'content' ? (byId.get(p.id) ?? 'No result.') : p.text;
    const text = truncate(raw, Math.max(400, Math.min(MAX_RESULT_CHARS, budget)));
    budget -= text.length;
    return {
      role: 'tool',
      tool_call_id: p.id,
      // Nos guides sont fiables ; tout ce qui vient de la page est une donnée.
      content:
        p.kind === 'local' && name === 'load_skill' && !raw.startsWith('Error')
          ? text
          : `<untrusted_tool_result name="${name}">\n${text}\n</untrusted_tool_result>`,
    };
  });
}

/** Appels d'outils écrits dans la réponse JSON (mode sans outils natifs), au format natif. */
export function jsonToolCalls(calls: AgentStepCall[]): ToolCall[] {
  return calls.map((call, i) => ({
    id: `json_${i}`,
    type: 'function',
    function: {
      name: call.name,
      arguments: JSON.stringify(
        call.name === 'find_elements'
          ? { queries: call.queries, within: call.within }
          : call.name === 'inspect_regions'
            ? { regions: call.regions, depth: call.depth }
            : { name: call.skill },
      ),
    },
  }));
}
