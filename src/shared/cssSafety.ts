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

const PROPERTY = /^(?:--|-)?[a-z][a-z0-9-]*$/;

/**
 * Allow-list des propriétés (PRD §6) : apparence et mise en page uniquement.
 * Exclut notamment `content` (injection de texte) et `all` (remise à zéro brutale).
 */
const ALLOWED_PROPERTY = new RegExp(
  '^(?:' +
    [
      'display',
      'visibility',
      'opacity',
      'position',
      'top',
      'right',
      'bottom',
      'left',
      'inset(?:-.+)?',
      'z-index',
      'float',
      'clear',
      'overflow(?:-.+)?',
      'box-sizing',
      '(?:min-|max-)?(?:width|height)',
      '(?:min-|max-)?(?:block|inline)-size',
      'margin(?:-.+)?',
      'padding(?:-.+)?',
      'border(?:-.+)?',
      'outline(?:-.+)?',
      'background(?:-.+)?',
      'color',
      'accent-color',
      'caret-color',
      'font(?:-.+)?',
      'line-height',
      'letter-spacing',
      'word-spacing',
      'text-(?:.+)',
      'white-space(?:-.+)?',
      'word-break',
      'overflow-wrap',
      'hyphens',
      'vertical-align',
      'list-style(?:-.+)?',
      'flex(?:-.+)?',
      'grid(?:-.+)?',
      'gap',
      'row-gap',
      'column-gap',
      'order',
      'align-(?:.+)',
      'justify-(?:.+)',
      'place-(?:.+)',
      'box-shadow',
      'filter',
      'backdrop-filter',
      'transform(?:-.+)?',
      'translate',
      'rotate',
      'scale',
      'transition(?:-.+)?',
      'animation(?:-.+)?',
      'cursor',
      'pointer-events',
      'user-select',
      'object-fit',
      'object-position',
      'aspect-ratio',
      'columns',
      'column-(?:.+)',
      'table-layout',
      'border-collapse',
      'border-spacing',
      'scroll-(?:.+)',
      'content-visibility',
      'isolation',
      'mix-blend-mode',
      'clip-path',
      'resize',
      'direction',
      'writing-mode',
      'zoom',
      'color-scheme',
      'appearance',
      'container(?:-.+)?',
      'contain',
      'tab-size',
      'quotes',
      '-webkit-(?:line-clamp|box-orient|text-.+|font-smoothing|appearance|user-select)',
      '--[a-z0-9-]+',
    ].join('|') +
    ')$',
);

export function isAllowedProperty(property: string): boolean {
  return ALLOWED_PROPERTY.test(property);
}

/** Valide une déclaration isolée (propriété + valeur), sans `;`, `{` ni `}`. */
export function isSafeDeclaration(property: string, value: string): boolean {
  if (!PROPERTY.test(property) || !isAllowedProperty(property)) return false;
  if (/[;{}]/.test(value) || value.length > 500) return false;
  return cssViolation(`${property}:${value}`) === null;
}

/** Un sélecteur ne doit pas pouvoir sortir de son bloc. */
export function isSafeSelector(selector: string): boolean {
  if (!selector.trim() || selector.length > 300) return false;
  if (/[{};]/.test(selector)) return false;
  return cssViolation(selector) === null;
}
