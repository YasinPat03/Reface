// Onglets dont une génération est en cours : la pré-étude ne redistille jamais pendant ce temps
// (une nouvelle distillation rendrait périmés les index de la génération).
const generating = new Set<number>();

export function isGenerating(tabId: number): boolean {
  return generating.has(tabId);
}

export async function whileGenerating<T>(tabId: number, run: () => Promise<T>): Promise<T> {
  generating.add(tabId);
  try {
    return await run();
  } finally {
    generating.delete(tabId);
  }
}
