// Boucle de l'agent : le LLM répond tout de suite (cas le plus fréquent) ou demande des outils
// d'examen, au plus `maxRounds` tours et dans un budget de temps ; ensuite il DOIT répondre
// (tool_choice « none »). Les dépendances sont injectées : la boucle se teste sans Chrome.
import { LlmError, type ChatMessage, type ToolCall, type Turn } from './llm';

export interface LoopDeps {
  complete(messages: ChatMessage[], toolChoice: 'auto' | 'none'): Promise<Turn>;
  runTools(calls: ToolCall[]): Promise<ChatMessage[]>;
  now(): number;
}

export interface LoopOptions {
  maxRounds: number;
  budgetMs: number;
  /** Ajouté juste avant le tour où le modèle doit répondre (rappel de la langue, du format). */
  finalNote?: string;
}

export interface LoopResult {
  value: unknown;
  /** Conversation complète (tours d'outils compris), pour une éventuelle auto-correction. */
  messages: ChatMessage[];
  rounds: number;
}

export async function runAgentLoop(
  initial: ChatMessage[],
  deps: LoopDeps,
  { maxRounds, budgetMs, finalNote }: LoopOptions,
): Promise<LoopResult> {
  const messages = [...initial];
  const start = deps.now();
  let rounds = 0;
  let forced = false;
  for (;;) {
    const mustAnswer = rounds >= maxRounds || deps.now() - start >= budgetMs;
    if (mustAnswer && !forced && rounds > 0 && finalNote) {
      messages.push({ role: 'user', content: finalNote });
    }
    forced ||= mustAnswer;
    const turn = await deps.complete(messages, mustAnswer ? 'none' : 'auto');
    if (turn.kind === 'answer') return { value: turn.value, messages, rounds };
    // Un fournisseur qui ignore « none » : un seul tour de grâce, puis on s'arrête.
    if (rounds > maxRounds) {
      throw new LlmError('The AI kept inspecting the page without answering. Try again.', true);
    }
    messages.push(turn.message, ...(await deps.runTools(turn.calls)));
    rounds++;
  }
}
