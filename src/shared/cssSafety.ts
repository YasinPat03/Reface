// Garde-fous CSS (PRD §6). Pur : utilisable dans le SW, le content script et les tests.

/** Motifs interdits partout : ressources externes, exfiltration, escapes, code. */
const FORBIDDEN: RegExp[] = [
  // eslint-disable-next-line no-control-regex -- on cherche justement le caractère nul
  /[\\\u0000]/, // escapes et caractère nul
  /\/\*|\*\//, // commentaires (permettent de masquer des motifs)
  /@(?:import|namespace|font-face|property)\b/i,
  /\b(?:url|image|image-set|cross-fade|paint|element|attr|expression|src)\s*\(/i,
  /(?:https?|data|javascript|file|chrome-extension|blob)\s*:/i,
  /-moz-binding\s*:|behavior\s*:/i,
  /<\/?\s*style/i,
];

export const MAX_CSS_LENGTH = 16_000;

/** Retourne la raison du rejet, ou null si le texte est acceptable. */
export function cssViolation(text: string): string | null {
  if (text.length > MAX_CSS_LENGTH) return 'CSS trop volumineux.';
  for (const pattern of FORBIDDEN) {
    if (pattern.test(text)) return `Motif CSS interdit (${pattern.source}).`;
  }
  return null;
}

const PROPERTY = /^-?[a-z][a-z0-9-]*$/;

/** Valide une déclaration isolée (propriété + valeur), sans `;`, `{` ni `}`. */
export function isSafeDeclaration(property: string, value: string): boolean {
  if (!PROPERTY.test(property)) return false;
  if (/[;{}]/.test(value) || value.length > 500) return false;
  return cssViolation(`${property}:${value}`) === null;
}

/** Un sélecteur ne doit pas pouvoir sortir de son bloc. */
export function isSafeSelector(selector: string): boolean {
  if (!selector.trim() || selector.length > 300) return false;
  if (/[{};]/.test(selector)) return false;
  return cssViolation(selector) === null;
}
