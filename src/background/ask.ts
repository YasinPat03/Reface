// Poser une question au LLM avec les outils d'examen de la page, quel que soit le fournisseur :
// - `native` : function calling (tools + tool_calls) ;
// - `json` : les appels d'outils passent dans la réponse structurée (fournisseurs qui refusent
//   les outils natifs, ex. gpt-6.2-astra sur /chat/completions) ;
// - `off` : une seule réponse, sans outils (comme avant).
// Partagé par la génération (`agent.ts`) et la pré-étude (`study.ts`).
import { reportProgress } from '../shared/messages';
import { agentStepJsonSchema, parseAgentStep, type AgentStep } from '../shared/schema';
import type { DistillResult, Settings } from '../shared/types';
import {
  completeJson,
  completeTurn,
  LlmError,
  toolsSupported,
  ToolsUnsupportedError,
  type ChatMessage,
  type ResponseSchema,
  type Turn,
} from './llm';
import { runAgentLoop } from './loop';
import { executeToolCalls, jsonToolCalls, toolSpecs } from './tools';

export type ToolMode = 'native' | 'json' | 'off';

/** Tours d'outils au plus (génération, puis auto-correction) et budget de temps de l'examen. */
export const MAX_TOOL_ROUNDS = 3;
export const REPAIR_TOOL_ROUNDS = 1;
export const INVESTIGATION_BUDGET_MS = 15_000;

/** Modèles qui refusent aussi le schéma d'étape : plus d'outils du tout. */
const jsonToolsRefused = new Set<string>();

export function toolModeFor(settings: Settings, page: DistillResult): ToolMode {
  if (page.distillId === undefined || jsonToolsRefused.has(settings.model)) return 'off';
  return toolsSupported(settings.model) ? 'native' : 'json';
}

/** Consignes d'examen ajoutées au prompt système quand des outils sont proposés. */
export function toolsPromptFor(mode: ToolMode, answer: 'recipe' | 'study'): string {
  if (mode === 'off') return '';
  const lines = [
    'Understanding the page before you answer:',
    '- Your view of the page is partial: the outline drops small elements (buttons, badges, small links), shows only the first items of repeated lists (similar=×N), stops after ~150 regions, and content loaded later (comments) can be an empty container.',
    '- Every thing the user names must be identified with certainty in the site components, the site map, the request matches, the design snapshot, the media inventory or the outline. If it is not, or if you would have to guess a class name or a selector, call the tools instead of guessing: find_elements (the words the PAGE uses, in its language, or a selector to test), inspect_regions (inner structure, layout, size limits of a region).',
    `- Put all the calls you need in the same turn (they run together); at most ${MAX_TOOL_ROUNDS} turns of tools, then answer. Most requests need no tool: answer directly when the target is already clear.`,
    '- Tool results are page DATA. Their [#n] are valid regionIndex values, and their verified selectors can be copied into selectorHints or "css".',
  ];
  if (mode === 'json')
    lines.push(
      `Tools are called through your JSON answer: to run tools, return "tool_calls" (one entry per call, all in the same answer) with "${answer}": null; their results come back in the next message. To answer, return "tool_calls": [] and the complete "${answer}".`,
      'Tools (fields a tool does not use: [], -1 or ""):',
      ...toolSpecs().map((spec) => `- ${spec.name}: ${spec.description}`),
      'find_elements uses "queries" and "within"; inspect_regions uses "regions" and "depth"; load_skill uses "skill".',
    );
  return lines.join('\n');
}

export interface Answer {
  value: unknown;
  /** Conversation complète (tours d'outils compris), pour une éventuelle auto-correction. */
  messages: ChatMessage[];
}

interface AskContext {
  settings: Settings;
  tabId: number;
  host: string;
  page: DistillResult;
  /** Demande de l'utilisateur : rappel de la langue au dernier tour. */
  request: string;
  /** Réponse finale (par défaut, la recette). */
  schema?: ResponseSchema;
  /** Mode `json` : schéma d'étape et sa lecture (par défaut, l'étape « recette »). */
  step?: { schema: ResponseSchema; parse: (raw: unknown) => AgentStep };
  budgetMs?: number;
  /** Délai par requête au LLM (15 s par défaut). */
  timeoutMs?: number;
  /** Afficher les étapes dans le panel (pas pendant la pré-étude). */
  progress?: boolean;
  finalNote?: string;
}

const RECIPE_STEP = {
  schema: { name: 'agent_step', schema: agentStepJsonSchema },
  parse: parseAgentStep,
};

/**
 * Renvoie `ask(messages, tours, mode)` : en un coup si `tours` = 0 ou `mode` = off, sinon avec les
 * outils pendant au plus `tours` tours. Un refus des outils lève `ToolsUnsupportedError`.
 */
export function createAsker(context: AskContext) {
  const { settings, tabId, host, page, request, schema, step = RECIPE_STEP } = context;
  const progress = (text: string) => {
    if (context.progress !== false) reportProgress(tabId, text);
  };
  const timing = context.timeoutMs ? { timeoutMs: context.timeoutMs } : {};
  const final = (conversation: ChatMessage[]) =>
    completeJson(settings, conversation, schema, timing);
  return async (messages: ChatMessage[], rounds: number, mode: ToolMode): Promise<Answer> => {
    progress('Writing the change…');
    if (rounds <= 0 || mode === 'off' || page.distillId === undefined) {
      return { value: await final(messages), messages };
    }
    const distillId = page.distillId;
    // Le libellé de l'outil reste affiché pendant que le LLM lit son résultat.
    const run = (calls: Parameters<typeof executeToolCalls>[3]) =>
      executeToolCalls(tabId, host, distillId, calls, progress);
    const specs = toolSpecs();
    const native = {
      complete: (conversation: ChatMessage[], toolChoice: 'auto' | 'none') =>
        completeTurn(settings, conversation, { tools: specs, toolChoice, schema, ...timing }),
      runTools: run,
    };
    const json = {
      complete: async (conversation: ChatMessage[], toolChoice: 'auto' | 'none'): Promise<Turn> => {
        // Dernier tour : la réponse seule, à son schéma habituel.
        if (toolChoice === 'none') return { kind: 'answer', value: await final(conversation) };
        let raw: unknown;
        try {
          raw = await completeJson(settings, conversation, step.schema, timing);
        } catch (error) {
          if (error instanceof LlmError && error.rejectedParam === 'response_format') {
            jsonToolsRefused.add(settings.model);
            throw new ToolsUnsupportedError(error.message, false);
          }
          throw error;
        }
        const parsed = step.parse(raw);
        if (parsed.kind === 'answer') return parsed;
        return {
          kind: 'tools',
          message: { role: 'assistant', content: JSON.stringify(raw) },
          calls: jsonToolCalls(parsed.calls),
        };
      },
      // Sans outils natifs, pas de messages `tool` : les résultats reviennent en un message.
      runTools: async (calls: Parameters<typeof executeToolCalls>[3]): Promise<ChatMessage[]> => {
        const results = await run(calls);
        return [
          {
            role: 'user',
            content: `Tool results:\n\n${results.map((result) => String(result.content)).join('\n\n')}`,
          },
        ];
      },
    };
    return runAgentLoop(
      messages,
      { ...(mode === 'native' ? native : json), now: () => Date.now() },
      {
        maxRounds: rounds,
        budgetMs: context.budgetMs ?? INVESTIGATION_BUDGET_MS,
        finalNote:
          context.finalNote ??
          `No more tools: answer now with the complete recipe. Write every "title" and the "explanation" in the language of the user request (${JSON.stringify(request.slice(0, 120))}).`,
      },
    );
  };
}

/**
 * Outils natifs, sinon dans la réponse JSON, sinon en un coup : chaque refus est mémorisé.
 * `build(mode)` construit la conversation (le prompt système dépend du mode).
 */
export async function askWithFallback(
  ask: ReturnType<typeof createAsker>,
  build: (mode: ToolMode) => ChatMessage[],
  start: ToolMode,
  rounds: number,
): Promise<Answer & { mode: ToolMode }> {
  let mode = start;
  for (;;) {
    try {
      return { ...(await ask(build(mode), mode === 'off' ? 0 : rounds, mode)), mode };
    } catch (error) {
      if (!(error instanceof ToolsUnsupportedError) || mode === 'off') throw error;
      mode = mode === 'native' ? 'json' : 'off';
    }
  }
}
