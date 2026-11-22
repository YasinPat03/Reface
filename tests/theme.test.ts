import { describe, expect, it } from 'vitest';
import { DESIGN_REFERENCES, designGuide } from '../src/shared/designReferences';
import {
  compileTheme,
  contrast,
  parseColor,
  readable,
  resolveTheme,
  splitSelectors,
  toDropShadow,
  type RoleMap,
  type ThemeTokens,
} from '../src/shared/theme';

const tokens = (over: Partial<ThemeTokens> = {}): ThemeTokens => ({
  inspiredBy: '',
  palette: {
    background: '#f6f8fa',
    surface: '#ffffff',
    text: '#1f2328',
    muted: '#59636e',
    accent: '#0969da',
    header: '#24292f',
    onHeader: '#ffffff',
    border: '#d1d9e0',
  },
  typography: { fontFamily: 'system-ui, sans-serif', baseSize: 14, scale: 1.25, titleWeight: 600 },
  shape: { radius: 8, shadow: '0 1px 3px rgba(0,0,0,.12)' },
  layout: { cards: true, density: 'comfortable', maxWidth: 0, dividers: false },
  roleStyles: [],
  ...over,
});

/** Rôles de HN, tels que `roleMap()` les produit. */
const HN: RoleMap = {
  header: '#hnmain > tbody > tr:nth-of-type(1) > td',
  footer: '#hnmain > tbody > tr:nth-of-type(4) > td > center',
  surfaces: [{ selector: '#hnmain', containsList: true }],
  hasBgcolor: true,
  main: '#hnmain',
  present: { headings: false, inputs: true },
  list: {
    container: '#hnmain > tbody > tr:nth-of-type(3) > td > table > tbody',
    item: 'tr.athing.submission',
    table: true,
    companions: ['tr.athing.submission + tr'],
    spacer: 'tr.athing.submission + tr + tr',
    title: 'tr.athing.submission span.titleline > a',
    meta: ['tr.athing.submission span.sitebit.comhead', 'tr.athing.submission + tr td.subtext'],
  },
};

const rgb = (hex: string) => parseColor(hex)!;

describe('références de design', () => {
  it.each(DESIGN_REFERENCES.map((r) => [r.name, r] as const))(
    '%s respecte ses propres principes (contraste)',
    (_, r) => {
      const { palette: p } = r;
      for (const bg of [p.background, p.surface]) {
        expect(contrast(rgb(p.text), rgb(bg))).toBeGreaterThanOrEqual(7);
        expect(contrast(rgb(p.muted), rgb(bg))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(rgb(p.accent), rgb(bg))).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(rgb(p.onHeader), rgb(p.header))).toBeGreaterThanOrEqual(4.5);
      expect(r.scale).toBeGreaterThan(1);
    },
  );
  it('tient dans un bloc de prompt compact', () => {
    expect(designGuide().length).toBeLessThan(6000);
  });
});

describe('readable', () => {
  it('fonce un gris trop clair juste ce qu’il faut, sans sauter au noir', () => {
    const fixed = readable('#9a9a9a', ['#ffffff']);
    expect(contrast(rgb(fixed), [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
    expect(fixed).not.toBe('#000000');
    expect(rgb(fixed)[0]).toBeGreaterThan(80); // reste un gris, pas du noir
  });
  it('éclaircit sur fond sombre', () => {
    const fixed = readable('#444444', ['#111111']);
    expect(contrast(rgb(fixed), [17, 17, 17])).toBeGreaterThanOrEqual(4.5);
  });
  it('laisse une couleur déjà lisible ou illisible par le parseur', () => {
    expect(readable('#111111', ['#ffffff'])).toBe('#111111');
    expect(readable('var(--x)', ['#ffffff'])).toBe('var(--x)');
  });
});

describe('resolveTheme : hiérarchie garantie', () => {
  it('le titre dépasse toujours les métadonnées, qui restent ≥ 12 px', () => {
    const t = resolveTheme(
      tokens({ typography: { fontFamily: 'Inter', baseSize: 11, scale: 0.8, titleWeight: 950 } }),
    );
    expect(t.meta).toBeGreaterThanOrEqual(12);
    expect(t.title).toBeGreaterThanOrEqual(t.meta + 3);
    expect(t.weight).toBe(800);
    expect(t.fontFamily).toMatch(/system-ui, sans-serif$/);
  });
  it('rend lisibles un texte secondaire et une barre trop pâles', () => {
    const t = resolveTheme(
      tokens({
        palette: { ...tokens().palette, muted: '#c8c8c8', header: '#3b82f6', onHeader: '#93c5fd' },
      }),
    );
    expect(contrast(rgb(t.palette.muted), [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(t.palette.onHeader), rgb('#3b82f6'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('compileTheme', () => {
  const css = compileTheme(tokens(), HN);
  it('repeint la page, les surfaces bgcolor, la barre et son texte', () => {
    expect(css).toContain(':where(html,body){background-color:#f6f8fa');
    expect(css).toContain(':where([bgcolor]){background-color:#f6f8fa}');
    expect(css).toContain(
      ':where(#hnmain > tbody > tr:nth-of-type(1) > td){background-color:#24292f',
    );
    expect(css).toMatch(/tr:nth-of-type\(1\) > td \*:not\(input\)[^{]*\)\{color:#ffffff\}/);
  });
  it('fait des cartes en tableau : cellules de l’élément ET de sa ligne compagne, espaceur', () => {
    expect(css).toContain(
      ':where(tr.athing.submission > td,tr.athing.submission + tr > td){background-color:#ffffff}',
    );
    expect(css).toContain(
      ':where(tr.athing.submission > td:first-child){border-top-left-radius:8px}',
    );
    expect(css).toContain(
      ':where(tr.athing.submission + tr > td:last-child){border-bottom-right-radius:8px}',
    );
    expect(css).toContain(':where(tr.athing.submission + tr + tr){height:16px}');
    expect(css).not.toContain('border-spacing');
    // Une seule ombre par carte, portée par le conteneur (pas de couture entre les lignes).
    expect(css).toContain('tbody){filter:drop-shadow(0px 1px 3px rgba(0,0,0,.12))}');
    expect(css).not.toMatch(/tr\.athing\.submission[^{]*\{filter/);
  });
  it('titre plus grand que les métadonnées, appliqué au lien seulement', () => {
    expect(css).toContain(':where(tr.athing.submission span.titleline > a){font-size:18px');
    expect(css).toMatch(/tr\.athing\.submission span\.sitebit\.comhead,[^{]*\{font-size:12px/);
    expect(css).not.toMatch(/tr\.athing\.submission\)\{[^}]*font-size/);
  });
  it('est une couche de base : chaque sélecteur est dans :where() (spécificité nulle)', () => {
    for (const line of css.split('\n')) expect(line).toMatch(/^:where\(/);
  });
  it('les styles par rôle ne peuvent pas écraser couleur ni taille', () => {
    const extra = compileTheme(
      tokens({
        roleStyles: [
          {
            role: 'title',
            declarations: { color: '#fff', 'font-size': '9px', 'letter-spacing': '-0.01em' },
          },
        ],
      }),
      HN,
    );
    const last = extra.split('\n').at(-1)!;
    expect(last).toContain('letter-spacing:-0.01em');
    expect(last).not.toMatch(/color|font-size/);
  });
  it('n’émet pas de règles pour les éléments absents de la page', () => {
    expect(css).not.toContain('h1,h2,h3,h4)');
    expect(css).toContain(':where(input,textarea,select){');
  });
  it('sans liste (article), applique tout de même page, liens et titres', () => {
    const article = compileTheme(tokens(), {
      ...HN,
      list: null,
      hasBgcolor: false,
      present: { headings: true, inputs: false },
    });
    expect(article).toContain(':where(a,a:visited){color:');
    expect(article).toContain(':where(h1,h2,h3,h4){color:');
  });
});

describe('splitSelectors', () => {
  it('ne coupe pas à l’intérieur des parenthèses ni des attributs', () => {
    expect(splitSelectors(':where(a, b),td *:not(input):not(select), [x="1,2"] p')).toEqual([
      ':where(a, b)',
      'td *:not(input):not(select)',
      '[x="1,2"] p',
    ]);
  });
});

describe('toDropShadow', () => {
  it('convertit un box-shadow en drop-shadow (sans étalement)', () => {
    expect(toDropShadow('0 1px 3px 2px rgba(0,0,0,.12)')).toBe(
      'drop-shadow(0px 1px 3px rgba(0,0,0,.12))',
    );
    expect(toDropShadow('none')).toBeNull();
  });
});
