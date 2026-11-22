// Source du « ce qui est beau » : des références tirées de systèmes de design reconnus, décrites
// par leurs jetons et par ce qui fait leur qualité, et des principes. Le LLM s'en INSPIRE (il peut
// les mélanger ou s'en écarter) : il conçoit toujours son propre jeu de jetons.
// Polices système uniquement (@font-face est interdit). Texte statique → mis en cache par l'API.
import type { ThemePalette } from './theme';

export interface DesignReference {
  name: string;
  /** Ce qui rend ce style beau, en une phrase. */
  why: string;
  palette: ThemePalette;
  fontFamily: string;
  baseSize: number;
  scale: number;
  titleWeight: number;
  radius: number;
  shadow: string;
  cards: boolean;
  density: 'compact' | 'comfortable' | 'airy';
}

export const DESIGN_REFERENCES: DesignReference[] = [
  {
    name: 'Linear (dark)',
    why: 'near-black blue-tinted surfaces, one violet accent, quiet muted text, tight density, crisp 6px corners, hairline borders instead of shadows',
    palette: {
      background: '#0f1115',
      surface: '#16181d',
      text: '#e6e7eb',
      muted: '#9a9ca5',
      accent: '#8b8cf5',
      header: '#16181d',
      onHeader: '#e6e7eb',
      border: '#262932',
    },
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    baseSize: 14,
    scale: 1.2,
    titleWeight: 500,
    radius: 6,
    shadow: 'none',
    cards: true,
    density: 'compact',
  },
  {
    name: 'Apple',
    why: 'generous white space, large confident titles, neutral grays, a single blue accent, soft large shadows, 12px corners',
    palette: {
      background: '#f5f5f7',
      surface: '#ffffff',
      text: '#1d1d1f',
      muted: '#6e6e73',
      accent: '#0066cc',
      header: '#ffffff',
      onHeader: '#1d1d1f',
      border: '#e5e5ea',
    },
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
    baseSize: 15,
    scale: 1.35,
    titleWeight: 600,
    radius: 12,
    shadow: '0 4px 16px rgba(0,0,0,.06)',
    cards: true,
    density: 'airy',
  },
  {
    name: 'Medium (reading)',
    why: 'editorial serif titles, high-contrast near-black text on white, narrow column, almost no chrome, green accent used sparingly',
    palette: {
      background: '#ffffff',
      surface: '#ffffff',
      text: '#242424',
      muted: '#6b6b6b',
      accent: '#1a8917',
      header: '#ffffff',
      onHeader: '#242424',
      border: '#f2f2f2',
    },
    fontFamily: 'Charter, "Bitstream Charter", Georgia, serif',
    baseSize: 17,
    scale: 1.3,
    titleWeight: 700,
    radius: 0,
    shadow: 'none',
    cards: false,
    density: 'airy',
  },
  {
    name: 'Material 3',
    why: 'tonal surfaces tinted by the primary color, rounded 12-16px containers, clear elevation, friendly purple primary',
    palette: {
      background: '#fef7ff',
      surface: '#f3edf7',
      text: '#1d1b20',
      muted: '#49454f',
      accent: '#6750a4',
      header: '#6750a4',
      onHeader: '#ffffff',
      border: '#cac4d0',
    },
    fontFamily: 'Roboto, "Segoe UI", system-ui, sans-serif',
    baseSize: 14,
    scale: 1.25,
    titleWeight: 500,
    radius: 14,
    shadow: '0 1px 3px rgba(0,0,0,.15)',
    cards: true,
    density: 'comfortable',
  },
  {
    name: 'GitHub Primer',
    why: 'functional and dense, cool grays, blue links, 6px corners, 1px borders define structure rather than shadows',
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
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
    baseSize: 14,
    scale: 1.15,
    titleWeight: 600,
    radius: 6,
    shadow: 'none',
    cards: true,
    density: 'compact',
  },
  {
    name: 'Stripe',
    why: 'confident deep navy text, vivid indigo accent, airy layout, soft blue-tinted shadows, polished 8px corners',
    palette: {
      background: '#f6f9fc',
      surface: '#ffffff',
      text: '#0a2540',
      muted: '#425466',
      accent: '#6159fa',
      header: '#0a2540',
      onHeader: '#ffffff',
      border: '#e3e8ee',
    },
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    baseSize: 15,
    scale: 1.3,
    titleWeight: 600,
    radius: 8,
    shadow: '0 2px 5px rgba(50,50,93,.1), 0 1px 2px rgba(0,0,0,.07)',
    cards: true,
    density: 'comfortable',
  },
  {
    name: 'Nord',
    why: 'calm arctic palette, desaturated blue-grays, frost-blue accent, low visual noise, comfortable density',
    palette: {
      background: '#2e3440',
      surface: '#3b4252',
      text: '#eceff4',
      muted: '#c0c8d6',
      accent: '#88c0d0',
      header: '#3b4252',
      onHeader: '#eceff4',
      border: '#4c566a',
    },
    fontFamily: 'system-ui, "Segoe UI", Ubuntu, sans-serif',
    baseSize: 14,
    scale: 1.2,
    titleWeight: 600,
    radius: 8,
    shadow: 'none',
    cards: true,
    density: 'comfortable',
  },
  {
    name: 'Solarized (light)',
    why: 'warm cream base, carefully balanced accent hues, low-glare reading, monospace-friendly',
    palette: {
      background: '#fdf6e3',
      surface: '#eee8d5',
      text: '#073642',
      muted: '#546a70',
      accent: '#196ba1',
      header: '#073642',
      onHeader: '#fdf6e3',
      border: '#d9cfb0',
    },
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    baseSize: 14,
    scale: 1.2,
    titleWeight: 600,
    radius: 4,
    shadow: 'none',
    cards: false,
    density: 'comfortable',
  },
  {
    name: 'Newspaper',
    why: 'black on off-white, strong serif headlines, thin rules between stories, no rounded corners, no color except one red',
    palette: {
      background: '#faf8f3',
      surface: '#faf8f3',
      text: '#111111',
      muted: '#555555',
      accent: '#a4161a',
      header: '#111111',
      onHeader: '#faf8f3',
      border: '#cfcac0',
    },
    fontFamily: 'Georgia, "Times New Roman", serif',
    baseSize: 15,
    scale: 1.4,
    titleWeight: 700,
    radius: 0,
    shadow: 'none',
    cards: false,
    density: 'comfortable',
  },
  {
    name: 'Neo-brutalist',
    why: 'bold flat colors, thick black borders, hard offset shadows, chunky type: playful and loud on purpose',
    palette: {
      background: '#fff4d6',
      surface: '#ffffff',
      text: '#000000',
      muted: '#333333',
      accent: '#0047ff',
      header: '#ff5c39',
      onHeader: '#000000',
      border: '#000000',
    },
    fontFamily: 'ui-sans-serif, "Arial Black", system-ui, sans-serif',
    baseSize: 15,
    scale: 1.3,
    titleWeight: 800,
    radius: 0,
    shadow: '4px 4px 0 #000000',
    cards: true,
    density: 'comfortable',
  },
];

export const DESIGN_PRINCIPLES = [
  'One accent color at most; everything else is neutrals derived from the background.',
  'A clear size hierarchy: title clearly larger than body, metadata clearly smaller (the compiler enforces title > meta).',
  'Contrast first: text ≥ 7:1 when possible, secondary text ≥ 4.5:1 (the compiler adjusts colors that fall short).',
  'One border-radius reused everywhere; shadows soft and low (or none with hairline borders).',
  'Consistent spacing rhythm (density); give content room to breathe.',
  'Dark themes: never pure black (#000) backgrounds; slightly tinted near-blacks, light gray text, not pure white.',
  'Repaint every surface (top bar included) so the palette is coherent; links match the accent.',
  'Match the site: a forum/list wants scannable density, an article wants a comfortable reading column.',
  'System fonts only (serif stacks like Georgia/Charter are fine for editorial looks).',
];

/** Bloc envoyé dans le prompt système (anglais, compact). */
export function designGuide(): string {
  const refs = DESIGN_REFERENCES.map(
    (r) =>
      `- ${r.name}: ${r.why}. bg ${r.palette.background}, surface ${r.palette.surface}, text ${r.palette.text}, muted ${r.palette.muted}, accent ${r.palette.accent}, header ${r.palette.header}/${r.palette.onHeader}, border ${r.palette.border}; font ${r.fontFamily}; base ${r.baseSize}px ×${r.scale}, weight ${r.titleWeight}; radius ${r.radius}px; shadow ${r.shadow}; ${r.cards ? 'cards' : 'no cards'}, ${r.density}.`,
  );
  return [
    'Design references (sources of what looks good, NOT templates: blend them, adapt them to the request and the site, or invent your own):',
    ...refs,
    'Design principles:',
    ...DESIGN_PRINCIPLES.map((p) => `- ${p}`),
  ].join('\n');
}
