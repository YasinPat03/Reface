import { compileRule } from './compile.ts';
import type { CatalogueEntry } from './catalogueSchema';

export function themeStyles(entry: CatalogueEntry): string {
  const css = entry.rules.map(compileRule).join('\n');
  const blocks: string[] = [];
  let block = '',
    depth = 0,
    quote = '',
    pending = false;
  for (const char of css) {
    if (quote) {
      block += char;
      if (char === quote) quote = '';
      continue;
    }
    if (/\s/.test(char)) {
      pending = true;
      continue;
    }
    if (pending && block && !/[{}:;,>+~]/.test(char) && !/[{}:;,>+~]$/.test(block)) block += ' ';
    pending = false;
    block += char;
    if (char === '"' || char === "'") quote = char;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      blocks.push(block.trim());
      block = '';
    }
  }
  if (block.trim()) blocks.push(block.trim());
  return [...new Set(blocks.reverse())].reverse().join('');
}
export function sameTheme(a: CatalogueEntry, b: CatalogueEntry): boolean {
  return a.pageUrl === b.pageUrl && themeStyles(a) === themeStyles(b);
}
