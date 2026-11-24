// Contexte de page pour le LLM : identité du site (nom, catégorie, métadonnées) et
// inventaire des médias (images, miniatures, vidéos) avec des sélecteurs de groupe vérifiés.
import { categoryFromSignals, knownSite, type SiteContext } from '../shared/siteContext';
import { isSafeSelector } from '../shared/cssSafety';
import { isStableId, stableClasses } from './selectors';
import { redact } from './distill';

const meta = (selector: string) =>
  document.querySelector<HTMLMetaElement>(selector)?.content?.trim() ?? '';

function jsonLdTypes(): string[] {
  const types = new Set<string>();
  for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(
    0,
    5,
  )) {
    const text = script.textContent ?? '';
    if (text.length > 100_000) continue;
    for (const match of text.matchAll(/"@type"\s*:\s*"([A-Za-z]{2,40})"/g)) types.add(match[1]!);
  }
  return [...types].slice(0, 6);
}

export function siteContext(): SiteContext {
  const host = location.hostname;
  const known = knownSite(host);
  const ogType = meta('meta[property="og:type"]');
  const types = jsonLdTypes();
  const bigVideo = [...document.getElementsByTagName('video')].some(
    (v) => v.getBoundingClientRect().width > window.innerWidth * 0.3,
  );
  const name =
    known?.[0] ||
    meta('meta[property="og:site_name"]') ||
    meta('meta[name="application-name"]') ||
    host.replace(/^www\./, '');
  const description = redact(
    meta('meta[name="description"]') || meta('meta[property="og:description"]'),
  ).slice(0, 160);
  const signals = [ogType && `og:type=${ogType}`, types.length && `schema.org=${types.join(',')}`]
    .filter(Boolean)
    .join(' ');
  return {
    host,
    name: name.slice(0, 60),
    category: known?.[1] ?? categoryFromSignals(ogType, types, bigVideo),
    signals,
    description,
  };
}

/** Signature CSS « parlante » d'un ancêtre : élément custom, id stable ou classe stable. */
export function anchorSignature(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  if (tag.includes('-')) return tag;
  if (element.id && isStableId(element.id)) return `#${element.id}`;
  const classes = stableClasses(element).slice(0, 1);
  return classes.length ? `${tag}.${classes[0]}` : null;
}

/** Sélecteur de groupe pour un média : jusqu'à 2 ancêtres parlants + la balise du média. */
function groupSelector(media: Element): string {
  const parts: string[] = [];
  for (
    let e = media.parentElement, hops = 0;
    e && e !== document.body && hops < 8;
    e = e.parentElement, hops++
  ) {
    const signature = anchorSignature(e);
    if (signature && !parts.includes(signature)) parts.unshift(signature);
    if (parts.length === 2 || signature?.startsWith('#')) break;
  }
  return [...parts, media.tagName.toLowerCase()].join(' ');
}

/**
 * Contraintes de taille qui limitent un média : max-width, width fixe, flex… sur lui et ses
 * 4 premiers ancêtres. Sans elles, l'IA « agrandit » sans effet (ex. max-width:500px chez YouTube).
 */
export function sizeConstraints(media: Element): string {
  const out: string[] = [];
  for (
    let e: Element | null = media, hops = 0;
    e && e !== document.body && hops < 5;
    e = e.parentElement, hops++
  ) {
    const s = getComputedStyle(e);
    const parts: string[] = [];
    if (s.maxWidth !== 'none') parts.push(`max-width:${s.maxWidth}`);
    if (s.minWidth !== '0px' && s.minWidth !== 'auto') parts.push(`min-width:${s.minWidth}`);
    if (s.maxHeight !== 'none') parts.push(`max-height:${s.maxHeight}`);
    const parentDisplay = e.parentElement ? getComputedStyle(e.parentElement).display : '';
    if (/flex/.test(parentDisplay) && s.flex !== '0 1 auto') parts.push(`flex:${s.flex}`);
    if (!parts.length) continue;
    const name = anchorSignature(e) ?? e.tagName.toLowerCase();
    out.push(`${name}{${parts.join(';')};width:${Math.round(e.getBoundingClientRect().width)}px}`);
    if (out.length >= 3) break;
  }
  return out.join(' ');
}

const MEDIA_SELECTOR = 'img, video, picture, canvas, [role="img"][style*="background"]';

/**
 * Inventaire des médias visibles, groupés par sélecteur : « 20× img ~360×202px — selector: … ».
 * Permet au LLM de cibler « les images » même si elles ne sont pas des régions du plan.
 */
export function mediaInventory(maxGroups = 8): string {
  const groups = new Map<
    string,
    { count: number; widths: number[]; heights: number[]; limits: string }
  >();
  for (const media of document.querySelectorAll(MEDIA_SELECTOR)) {
    if (media.tagName === 'IMG' && media.parentElement?.tagName === 'PICTURE') continue;
    const rect = media.getBoundingClientRect();
    if (rect.width < 48 || rect.height < 32) continue; // icônes, avatars minuscules
    if (
      typeof media.checkVisibility === 'function' &&
      !media.checkVisibility({ visibilityProperty: true })
    )
      continue;
    const key = groupSelector(media);
    const group = groups.get(key) ?? {
      count: 0,
      widths: [],
      heights: [],
      limits: sizeConstraints(media),
    };
    group.count++;
    group.widths.push(rect.width);
    group.heights.push(rect.height);
    groups.set(key, group);
  }
  const median = (values: number[]) =>
    Math.round([...values].sort((a, b) => a - b)[values.length >> 1] ?? 0);
  return [...groups.entries()]
    .filter(([selector]) => isSafeSelector(selector))
    .map(([selector, g]) => ({ selector, ...g, w: median(g.widths), h: median(g.heights) }))
    .sort((a, b) => b.count * b.w * b.h - a.count * a.w * a.h)
    .slice(0, maxGroups)
    .map((g) => {
      let matches = g.count;
      try {
        matches = document.querySelectorAll(g.selector).length;
      } catch {
        /* sélecteur invalide : on garde le compte observé */
      }
      const extra = matches > g.count ? ` (matches ${matches} incl. hidden/small)` : '';
      const limits = g.limits ? `\n    size limited by: ${g.limits}` : '';
      return `- ${g.count}× <${g.selector.split(' ').at(-1)}> currently ~${g.w}×${g.h}px — selector: "${g.selector}"${extra}${limits}`;
    })
    .join('\n');
}
