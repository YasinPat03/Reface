// Thème « par jetons » : le LLM conçoit le goût (palette, typographie, formes, mise en page,
// styles par rôle), l'extension l'exécute. Ce module est PUR (aucun DOM) : il compile
// jetons × carte des rôles → CSS, en garantissant par construction la hiérarchie
// (titre > métadonnées), le contraste (≥ 4,5:1) et la cohérence entre éléments d'une liste.
import { isSafeSelector } from './cssSafety';

export interface ThemePalette {
  /** Fond de page (derrière les cartes). */
  background: string;
  /** Surfaces : conteneur principal, cartes, encadrés. */
  surface: string;
  text: string;
  /** Texte secondaire (métadonnées, pied de page). */
  muted: string;
  /** Liens et accents. */
  accent: string;
  /** Barre du haut et son texte. */
  header: string;
  onHeader: string;
  border: string;
}

export type ThemeRole =
  | 'page'
  | 'header'
  | 'footer'
  | 'surface'
  | 'item'
  | 'title'
  | 'meta'
  | 'link'
  | 'heading'
  | 'input';

export interface ThemeTokens {
  /** Référence d'inspiration (« Linear », « Medium »…), vide pour une création originale. */
  inspiredBy: string;
  palette: ThemePalette;
  typography: {
    /** Pile de polices système (pas de @font-face). */
    fontFamily: string;
    /** Taille de base en px (texte courant). */
    baseSize: number;
    /** Ratio titre / base (1.15 à 1.6). */
    scale: number;
    titleWeight: number;
  };
  shape: {
    /** Rayon unique en px. */
    radius: number;
    /** Ombre CSS (box-shadow) ou « none ». */
    shadow: string;
  };
  layout: {
    cards: boolean;
    density: 'compact' | 'comfortable' | 'airy';
    /** Largeur maximale du contenu en px, 0 = inchangée. */
    maxWidth: number;
    dividers: boolean;
    /** Éléments de la liste par rangée (1 = liste, 2 à 4 = grille). */
    columns: number;
    /** Forme des cartes en grille. */
    cardShape: 'auto' | 'square' | 'landscape';
  };
  /** Liberté créative au-delà des jetons : déclarations par rôle. */
  roleStyles: { role: ThemeRole; declarations: Record<string, string> }[];
}

/** Carte des rôles de la page, produite par le content script (`content/design.ts`). */
export interface RoleMap {
  header: string | null;
  footer: string | null;
  /** Surfaces opaques hors en-tête ; `containsList` : elles portent la liste principale. */
  surfaces: { selector: string; containsList: boolean }[];
  hasBgcolor: boolean;
  main: string | null;
  /** Éléments présents sur la page : le thème n'émet pas de règles pour ce qui n'existe pas. */
  present: { headings: boolean; inputs: boolean };
  list: {
    /** Conteneur direct des éléments (porte l'ombre des cartes en tableau, sans couture). */
    container: string | null;
    /** Table qui contient le conteneur (tbody) : elle doit prendre toute la largeur en grille. */
    containerTable: string | null;
    item: string;
    /** Éléments en lignes de tableau (tr) : les cartes se font cellule par cellule. */
    table: boolean;
    /** Lignes qui prolongent l'élément (HN : la ligne de métadonnées). */
    companions: string[];
    /** Ligne vide qui sépare deux éléments. */
    spacer: string | null;
    /** Lien du titre de chaque élément. */
    title: string | null;
    meta: string[];
    /**
     * Élément en rangée horizontale, média à côté du texte (cartes vidéo YouTube) : la rangée et la
     * boîte du média. En grille, la carte s'empile, sinon la miniature déborde sur la voisine.
     */
    horizontal?: { row: string; media: string } | null;
    /** Les éléments portent un média (miniature, photo) : il fixe leurs proportions. */
    media?: boolean;
  } | null;
}

// --- Couleurs -------------------------------------------------------------------------------

export type Rgb = [number, number, number];

/** #rgb, #rrggbb, rgb()/rgba() ; null sinon (nom de couleur, var()…). */
export function parseColor(value: string): Rgb | null {
  const v = value.trim().toLowerCase();
  const short = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) return [1, 2, 3].map((i) => parseInt(short[i]!.repeat(2), 16)) as Rgb;
  const long = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})(?:[0-9a-f]{2})?$/);
  if (long) return [1, 2, 3].map((i) => parseInt(long[i]!, 16)) as Rgb;
  const rgb = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  if (v === 'white') return [255, 255, 255];
  if (v === 'black') return [0, 0, 0];
  return null;
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.max(0, Math.min(255, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Couleur lisible sur tous les fonds donnés (contraste ≥ `minimum`), aussi proche que possible
 * de l'intention : on fonce (fond clair) ou on éclaircit (fond sombre) progressivement, sans
 * jamais sauter au noir ou au blanc d'emblée. Une couleur illisible (nom, var()) est renvoyée telle quelle.
 */
export function readable(color: string, backgrounds: string[], minimum = 4.5): string {
  const fg = parseColor(color);
  const bgs = backgrounds.map(parseColor).filter((c): c is Rgb => !!c);
  if (!fg || !bgs.length) return color;
  const ok = (c: Rgb) => bgs.every((bg) => contrast(c, bg) >= minimum);
  if (ok(fg)) return color;
  // On part dans la direction naturelle (foncer sur fond clair), puis dans l'autre si elle échoue
  // (fond à luminance moyenne, ex. bleu vif) : la première couleur lisible trouvée est gardée.
  const dark = bgs.reduce((sum, bg) => sum + luminance(bg), 0) / bgs.length < 0.35;
  const directions: Rgb[] = dark
    ? [
        [255, 255, 255],
        [0, 0, 0],
      ]
    : [
        [0, 0, 0],
        [255, 255, 255],
      ];
  for (const target of directions) {
    for (let t = 0.04; t <= 1.0001; t += 0.04) {
      const candidate = mix(fg, target, Math.min(t, 1));
      if (ok(candidate)) return toHex(candidate);
    }
  }
  // Impossible sur ces fonds : le meilleur des deux extrêmes.
  const score = (c: Rgb) => Math.min(...bgs.map((bg) => contrast(c, bg)));
  return toHex(directions.sort((a, b) => score(b) - score(a))[0]!);
}

// --- Normalisation des jetons ----------------------------------------------------------------

const GENERIC_FONT =
  /\b(?:serif|sans-serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|cursive)\s*$/i;
const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

export interface ResolvedTheme {
  palette: ThemePalette;
  fontFamily: string;
  base: number;
  title: number;
  meta: number;
  weight: number;
  radius: number;
  shadow: string;
  unit: number;
}

/** Barre du haut lisible : on ajuste son texte, et si aucun texte n'y suffit, la barre elle-même. */
function headerPair(header: string, onHeader: string): Pick<ThemePalette, 'header' | 'onHeader'> {
  const text = readable(onHeader, [header], 4.5);
  const [h, t] = [parseColor(header), parseColor(text)];
  if (!h || !t || contrast(h, t) >= 4.5) return { header, onHeader: text };
  return { header: readable(header, [text], 4.5), onHeader: text };
}

/**
 * Jetons du LLM → valeurs garanties : tailles bornées et hiérarchisées (titre ≥ méta + 3 px,
 * méta ≥ 12 px), couleurs de texte rendues lisibles sur chacun de leurs fonds.
 */
export function resolveTheme(tokens: ThemeTokens): ResolvedTheme {
  const p = tokens.palette;
  const base = Math.round(clamp(tokens.typography.baseSize, 12, 22));
  let title = Math.round(base * clamp(tokens.typography.scale, 1.05, 1.8));
  let meta = Math.max(12, Math.round(base * 0.85));
  if (title < meta + 3) title = meta + 3;
  if (title < base + 1) title = base + 1;
  meta = Math.min(meta, title - 3);
  const fontFamily = GENERIC_FONT.test(tokens.typography.fontFamily)
    ? tokens.typography.fontFamily
    : `${tokens.typography.fontFamily || 'system-ui'}, system-ui, sans-serif`;
  const both = [p.background, p.surface];
  return {
    palette: {
      ...p,
      text: readable(p.text, both, 7),
      muted: readable(p.muted, both, 4.5),
      accent: readable(p.accent, both, 4.5),
      ...headerPair(p.header, p.onHeader),
    },
    fontFamily,
    base,
    title,
    meta,
    weight: clamp(Math.round(tokens.typography.titleWeight / 100) * 100, 400, 800),
    radius: Math.round(clamp(tokens.shape.radius, 0, 24)),
    shadow: tokens.shape.shadow?.trim() || 'none',
    unit: { compact: 4, comfortable: 8, airy: 12 }[tokens.layout.density] ?? 8,
  };
}

/** box-shadow → filter: drop-shadow() (une seule ombre, sans étalement) pour les lignes de tableau. */
export function toDropShadow(shadow: string): string | null {
  if (!shadow || shadow === 'none') return null;
  const first = shadow.split(/,(?![^(]*\))/)[0]!.trim();
  const color = first.match(/(?:rgba?|hsla?)\([^)]*\)|#[0-9a-f]{3,8}\b/i)?.[0] ?? 'rgba(0,0,0,.12)';
  const lengths = first
    .replace(color, '')
    .trim()
    .split(/\s+/)
    .filter((t) => /^-?[\d.]+(?:px)?$/.test(t));
  if (lengths.length < 2) return null;
  const [x, y, blur = '0'] = lengths.map((l) => (l.endsWith('px') ? l : `${l}px`));
  return `drop-shadow(${x} ${y} ${blur} ${color})`;
}

// --- Compilation ----------------------------------------------------------------------------

/** Découpe une liste de sélecteurs sur les virgules de premier niveau (pas celles de :where(a, b)). */
export function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of list) {
    if (char === '(' || char === '[') depth++;
    else if ((char === ')' || char === ']') && depth > 0) depth--;
    if (char === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
    } else current += char;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/**
 * `structural` : règle de structure de la grille (média contenu dans sa carte, carte empilée,
 * enfants hors liste en pleine largeur), rendue SANS :where() pour qu'une règle de taille déjà
 * gardée (« miniatures plus grosses », 580 px) ne fasse pas déborder les cartes.
 */
type Block = [
  selector: string,
  declarations: Record<string, string | null | undefined>,
  structural?: boolean,
];

function render(blocks: Block[]): string {
  return blocks
    .map(([selector, declarations, structural]) => {
      const parts = splitSelectors(selector).filter((s) => s && isSafeSelector(s));
      const body = Object.entries(declarations)
        .filter((entry): entry is [string, string] => !!entry[1])
        .map(([property, value]) => `${property}:${value}`)
        .join(';');
      // :where() → spécificité nulle : le thème est une COUCHE DE BASE. Les changements ciblés
      // (« barre en bleu ») et les corrections de contraste, plus spécifiques, l'affinent toujours ;
      // entre règles du thème, c'est l'ordre d'écriture qui décide.
      if (!parts.length || !body) return '';
      return structural ? `${parts.join(',')}{${body}}` : `:where(${parts.join(',')}){${body}}`;
    })
    .filter(Boolean)
    .join('\n');
}

const px = (n: number) => `${Math.round(n)}px`;

/** Propriétés réservées aux jetons : un style par rôle ne peut pas casser hiérarchie et contraste. */
const TOKEN_OWNED = new Set(['color', 'font-size']);

type List = NonNullable<RoleMap['list']>;

/** Liste verticale (une colonne) : cartes en tableau cellule par cellule, ou blocs. */
function listBlocks(tokens: ThemeTokens, t: ResolvedTheme, list: List, cards: boolean): Block[] {
  const p = t.palette;
  const blocks: Block[] = [];
  const last = list.companions.at(-1) ?? list.item;
  const rows = [list.item, ...list.companions];
  if (list.table) {
    const cells = (selector: string) => `${selector} > td`;
    if (cards) {
      blocks.push([rows.map(cells).join(', '), { 'background-color': p.surface }]);
      blocks.push([cells(list.item), { 'padding-top': px(t.unit * 1.5) }]);
      blocks.push([cells(last), { 'padding-bottom': px(t.unit * 1.5) }]);
      const r = px(t.radius);
      blocks.push([`${cells(list.item)}:first-child`, { 'border-top-left-radius': r }]);
      blocks.push([`${cells(list.item)}:last-child`, { 'border-top-right-radius': r }]);
      blocks.push([`${cells(last)}:first-child`, { 'border-bottom-left-radius': r }]);
      blocks.push([`${cells(last)}:last-child`, { 'border-bottom-right-radius': r }]);
      // L'ombre sur le conteneur entoure chaque carte d'un seul tenant (une ombre par ligne
      // laisserait une couture entre le titre et sa ligne de métadonnées).
      const drop = toDropShadow(t.shadow);
      if (drop && list.container) blocks.push([list.container, { filter: drop }]);
      if (list.spacer) blocks.push([list.spacer, { height: px(t.unit * 2) }]);
    } else {
      blocks.push([cells(list.item), { 'padding-top': px(t.unit) }]);
      blocks.push([cells(last), { 'padding-bottom': px(t.unit) }]);
      if (tokens.layout.dividers)
        blocks.push([cells(last), { 'border-bottom': `1px solid ${p.border}` }]);
    }
  } else if (cards) {
    blocks.push([
      list.item,
      {
        'background-color': p.surface,
        'border-radius': px(t.radius),
        padding: `${px(t.unit * 1.5)} ${px(t.unit * 2)}`,
        'margin-bottom': px(t.unit * 1.5),
        'box-shadow': t.shadow,
        border: `1px solid ${p.border}`,
      },
    ]);
  } else {
    blocks.push([list.item, { 'padding-top': px(t.unit), 'padding-bottom': px(t.unit) }]);
    if (tokens.layout.dividers)
      blocks.push([list.item, { 'border-bottom': `1px solid ${p.border}` }]);
  }
  return blocks;
}

/**
 * Grille de N cartes par rangée. Un élément peut s'étaler sur plusieurs frères (HN : titre,
 * ligne de métadonnées, espaceur) : chacun reçoit la colonne de SON élément (nth-child … of),
 * et le placement « dense » les empile dans la même colonne. La carte reste d'un seul tenant.
 */
function gridBlocks(tokens: ThemeTokens, t: ResolvedTheme, list: List, columns: number): Block[] {
  const p = t.palette;
  const blocks: Block[] = [];
  const gap = px(t.unit * 2);
  const container = list.container!;
  const shape = tokens.layout.cardShape;
  const cardDecl = {
    'background-color': p.surface,
    'box-sizing': 'border-box',
  };
  if (list.containerTable) blocks.push([list.containerTable, { display: 'block', width: '100%' }]);
  if (!list.table) {
    blocks.push([
      container,
      {
        display: 'grid',
        'grid-template-columns': `repeat(${columns}, minmax(0, 1fr))`,
        // Un enfant en pleine largeur (playlist, étagère) ne laisse pas de trou avant lui.
        'grid-auto-flow': 'row dense',
        gap,
        'align-items': 'stretch',
      },
    ]);
    blocks.push([
      list.item,
      {
        ...cardDecl,
        margin: '0',
        width: 'auto',
        'border-radius': px(t.radius),
        padding: `${px(t.unit * 2)} ${px(t.unit * 2)}`,
        'box-shadow': t.shadow,
        border: `1px solid ${p.border}`,
        // Une carte avec un média (miniature) prend les proportions du média : une hauteur
        // imposée par le format couperait le titre et les infos, qui passeraient sous la rangée
        // suivante.
        'aspect-ratio': list.media
          ? null
          : shape === 'square'
            ? '1 / 1'
            : shape === 'landscape'
              ? '4 / 3'
              : null,
      },
    ]);
    // Les autres enfants du conteneur (étagères, sections, « voir plus ») : toute la largeur,
    // sinon chacun est écrasé dans une case.
    blocks.push([`${container} > :not(${list.item})`, { 'grid-column': '1 / -1' }, true]);
    if (list.horizontal) {
      // Média à côté du texte : la carte s'empile (média au-dessus), rien n'est plus large qu'elle.
      blocks.push([
        list.horizontal.row,
        { 'flex-direction': 'column', 'align-items': 'stretch' },
        true,
      ]);
      blocks.push([`${list.horizontal.row} > *`, { 'min-width': '0', 'max-width': '100%' }, true]);
      blocks.push([
        list.horizontal.media,
        { width: '100%', 'max-width': '100%', 'min-width': '0', flex: 'none', margin: '0' },
        true,
      ]);
    }
    return blocks;
  }

  // Liste en lignes de tableau : chaque ligne devient une case ; les lignes d'un même élément
  // partagent sa colonne et s'empilent.
  const suffix = (selector: string) =>
    selector.startsWith(list.item) ? selector.slice(list.item.length) : null;
  const companions = list.companions.map(suffix).filter((x): x is string => x !== null);
  const spacer = list.spacer ? suffix(list.spacer) : null;
  const last = list.companions.at(-1) ?? list.item;
  blocks.push([
    container,
    {
      display: 'grid',
      'grid-template-columns': `repeat(${columns}, minmax(0, 1fr))`,
      'grid-auto-flow': 'row dense',
      'column-gap': gap,
      'row-gap': '0',
      width: '100%',
    },
  ]);
  // Lignes hors liste (« More », pied) : toute la largeur, après la grille.
  blocks.push([`${container} > *`, { 'grid-column': '1 / -1' }]);
  for (let column = 1; column <= columns; column++) {
    const nth = `${list.item}:nth-child(${columns}n+${column} of ${list.item})`;
    const members = [nth, ...companions.map((c) => `${nth}${c}`)];
    if (spacer) members.push(`${nth}${spacer}`);
    blocks.push([members.join(', '), { 'grid-column': String(column) }]);
  }
  const rows = [list.item, ...list.companions];
  blocks.push([
    rows.join(', '),
    { ...cardDecl, display: 'block', padding: `0 ${px(t.unit * 2)}`, margin: '0' },
  ]);
  blocks.push([
    list.item,
    {
      'padding-top': px(t.unit * 2),
      'border-top-left-radius': px(t.radius),
      'border-top-right-radius': px(t.radius),
      // Carte carrée/paysage : le titre occupe la hauteur, la ligne de métadonnées la complète.
      'aspect-ratio': shape === 'square' ? '5 / 4' : shape === 'landscape' ? '2 / 1' : null,
    },
  ]);
  blocks.push([
    last,
    {
      'padding-bottom': px(t.unit * 2),
      'border-bottom-left-radius': px(t.radius),
      'border-bottom-right-radius': px(t.radius),
    },
  ]);
  blocks.push([rows.map((r) => `${r} > td`).join(', '), { 'background-color': 'transparent' }]);
  if (list.spacer) blocks.push([list.spacer, { display: 'block', height: gap }]);
  const drop = toDropShadow(t.shadow);
  if (drop) blocks.push([container, { filter: drop }]);
  return blocks;
}

/** Jetons × rôles → CSS (à normaliser ensuite comme le CSS libre : `!important`, allow-list). */
export function compileTheme(tokens: ThemeTokens, roles: RoleMap): string {
  const t = resolveTheme(tokens);
  const p = t.palette;
  const list = roles.list;
  const cards = tokens.layout.cards && !!list;
  const blocks: Block[] = [];

  // Page et surfaces.
  blocks.push([
    'html, body',
    { 'background-color': p.background, color: p.text, 'font-family': t.fontFamily },
  ]);
  if (roles.hasBgcolor)
    blocks.push(['[bgcolor]', { 'background-color': cards ? p.background : p.surface }]);
  for (const surface of roles.surfaces) {
    blocks.push([
      surface.selector,
      {
        'background-color': cards && surface.containsList ? p.background : p.surface,
        color: p.text,
      },
    ]);
  }
  if (roles.main && tokens.layout.maxWidth > 0) {
    blocks.push([
      roles.main,
      {
        'max-width': px(clamp(tokens.layout.maxWidth, 480, 1600)),
        'margin-left': 'auto',
        'margin-right': 'auto',
      },
    ]);
  }

  // Liens et titres de section.
  blocks.push(['a, a:visited', { color: p.accent }]);
  if (roles.present.headings) {
    blocks.push(['h1, h2, h3, h4', { color: p.text, 'font-family': t.fontFamily }]);
    blocks.push(['h1', { 'font-weight': String(t.weight) }]);
  }
  if (roles.present.inputs) {
    blocks.push([
      'input, textarea, select',
      {
        'background-color': p.surface,
        color: p.text,
        border: `1px solid ${p.border}`,
        'border-radius': px(Math.max(4, t.radius / 2)),
      },
    ]);
  }

  // Barre du haut : tout son texte prend la couleur lisible sur son fond.
  if (roles.header) {
    blocks.push([
      roles.header,
      { 'background-color': p.header, color: p.onHeader, 'border-color': p.border },
    ]);
    // Les champs gardent leur propre fond (surface) : pas de texte clair sur fond clair.
    blocks.push([
      `${roles.header} *:not(input):not(textarea):not(select), ${roles.header} a:visited`,
      { color: p.onHeader },
    ]);
  }
  if (roles.footer) {
    blocks.push([
      roles.footer,
      { 'border-top': `1px solid ${p.border}`, 'padding-top': px(t.unit * 2) },
    ]);
    blocks.push([
      `${roles.footer}, ${roles.footer} *, ${roles.footer} a:visited`,
      { color: p.muted },
    ]);
  }

  // Liste principale : chaque élément est traité à l'identique.
  if (list) {
    const columns = Math.round(clamp(tokens.layout.columns ?? 1, 1, 4));
    // En grille étroite, un titre trop grand ferait des cartes illisibles.
    const titleSize =
      columns >= 3 ? Math.max(t.meta + 3, Math.min(t.title, Math.round(t.base * 1.15))) : t.title;
    if (list.meta.length) {
      const meta = list.meta.join(', ');
      blocks.push([meta, { 'font-size': px(t.meta), color: p.muted, 'line-height': '1.5' }]);
      blocks.push([list.meta.map((m) => `${m} a, ${m} a:visited`).join(', '), { color: p.muted }]);
    }
    if (list.title) {
      blocks.push([
        list.title,
        {
          'font-size': px(titleSize),
          'font-weight': String(t.weight),
          color: p.text,
          'line-height': '1.35',
          'text-decoration': 'none',
        },
      ]);
      blocks.push([`${list.title}:visited`, { color: p.muted }]);
    }
    if (columns > 1 && list.container) blocks.push(...gridBlocks(tokens, t, list, columns));
    else blocks.push(...listBlocks(tokens, t, list, cards));
  }

  // Styles par rôle du LLM (liberté créative), sans toucher aux propriétés tenues par les jetons.
  const selectorsOf: Record<ThemeRole, string | null> = {
    page: 'html, body',
    header: roles.header,
    footer: roles.footer,
    surface: roles.surfaces.map((s) => s.selector).join(', ') || null,
    item: list ? [list.item, ...list.companions].join(', ') : null,
    title: list?.title ?? 'h1',
    meta: list?.meta.join(', ') || null,
    link: 'a',
    heading: 'h1, h2, h3, h4',
    input: 'input, textarea, select',
  };
  for (const style of tokens.roleStyles) {
    const selector = selectorsOf[style.role];
    if (!selector) continue;
    const declarations = Object.fromEntries(
      Object.entries(style.declarations).filter(
        ([property]) => !TOKEN_OWNED.has(property.trim().toLowerCase()),
      ),
    );
    blocks.push([selector, declarations]);
  }
  return render(blocks);
}
