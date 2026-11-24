import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ToolCall, Turn } from '../src/background/llm';
import { runAgentLoop, type LoopDeps } from '../src/background/loop';

const start: ChatMessage[] = [
  { role: 'system', content: 's' },
  { role: 'user', content: 'User request: x' },
];
const tools = (id: string): Turn => {
  const calls: ToolCall[] = [
    { id, type: 'function', function: { name: 'find_elements', arguments: '{}' } },
  ];
  return { kind: 'tools', message: { role: 'assistant', content: null, tool_calls: calls }, calls };
};
const answer = (value: unknown): Turn => ({ kind: 'answer', value });

function deps(turns: Turn[], clock = { t: 0 }, step = 0) {
  const choices: string[] = [];
  const seen: ChatMessage[][] = [];
  const d: LoopDeps = {
    complete: vi.fn(async (messages, choice) => {
      choices.push(choice);
      seen.push([...messages]);
      clock.t += step;
      return turns.shift() ?? answer({ fallback: true });
    }),
    runTools: vi.fn(async (calls: ToolCall[]) =>
      calls.map((c): ChatMessage => ({ role: 'tool', tool_call_id: c.id, content: 'résultat' })),
    ),
    now: () => clock.t,
  };
  return { d, choices, seen };
}

describe('runAgentLoop', () => {
  it('réponse directe : un seul appel, avec les outils proposés', async () => {
    const { d, choices } = deps([answer({ ok: 1 })]);
    const result = await runAgentLoop(start, d, { maxRounds: 3, budgetMs: 10_000 });
    expect(result).toEqual({ value: { ok: 1 }, messages: start, rounds: 0 });
    expect(choices).toEqual(['auto']);
    expect(d.runTools).not.toHaveBeenCalled();
  });

  it('un tour d’outils puis la réponse ; la conversation garde les appels et les résultats', async () => {
    const { d, seen } = deps([tools('c1'), answer({ ok: 2 })]);
    const result = await runAgentLoop(start, d, { maxRounds: 3, budgetMs: 10_000 });
    expect(result.value).toEqual({ ok: 2 });
    expect(result.rounds).toBe(1);
    expect(seen[1]!.slice(2).map((m) => m.role)).toEqual(['assistant', 'tool']);
  });

  it('au plafond de tours, le modèle doit répondre (tool_choice none + note finale)', async () => {
    const { d, choices, seen } = deps([tools('a'), tools('b'), answer({ ok: 3 })]);
    const result = await runAgentLoop(start, d, {
      maxRounds: 2,
      budgetMs: 10_000,
      finalNote: 'Réponds.',
    });
    expect(result.value).toEqual({ ok: 3 });
    expect(choices).toEqual(['auto', 'auto', 'none']);
    expect(seen[2]!.at(-1)).toEqual({ role: 'user', content: 'Réponds.' });
  });

  it('budget de temps épuisé : réponse forcée au tour suivant', async () => {
    const clock = { t: 0 };
    const { d, choices } = deps([tools('a'), answer({ ok: 4 })], clock, 6_000);
    await runAgentLoop(start, d, { maxRounds: 3, budgetMs: 5_000 });
    expect(choices).toEqual(['auto', 'none']);
  });

  it('un fournisseur qui ignore « none » ne boucle pas sans fin', async () => {
    const { d } = deps([tools('a'), tools('b'), tools('c'), tools('d')]);
    await expect(runAgentLoop(start, d, { maxRounds: 1, budgetMs: 10_000 })).rejects.toThrow(
      /without answering/,
    );
    expect(d.complete).toHaveBeenCalledTimes(3);
  });

  it('zéro tour : le modèle doit répondre tout de suite', async () => {
    const { d, choices } = deps([answer({ ok: 5 })]);
    await runAgentLoop(start, d, { maxRounds: 0, budgetMs: 10_000, finalNote: 'x' });
    expect(choices).toEqual(['none']);
  });
});
