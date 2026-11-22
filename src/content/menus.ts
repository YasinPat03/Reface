// Menus repliés (hamburger, déroulants) : leurs liens sont cachés tant qu'on ne les ouvre pas,
// donc absents du plan et de l'instantané. On les signale au LLM, et l'extension sait les montrer
// en barre horizontale (`menuBar` dans la recette) : la mise en page est calculée et vérifiée ici,
// comme le thème, plutôt qu'écrite à la main (sur Wikipédia, en-tête de hauteur fixe, panneau en
// position absolue avec max-width : une CSS « évidente » empile les liens sur l'article).
import { isSafeSelector } from '../shared/cssSafety';
import { redact, textSample } from './distill';
import { buildSelectors, stableClasses } from './selectors';

const MIN_LINKS = 3;
/** Au-delà, c'est un méga-menu ou un tiroir de navigation : pas une barre. */
const MAX_LINKS = 40;
const MAX_MENUS = 3;
const HINT = /menu|nav|hamburger|burger|drawer/i;

interface Menu {
  panel: Element;
  toggles: Element[];
  links: Element[];
  label: string;
}

/** Menus de la dernière distillation : « [menu n] » → lastMenus[n - 1]. */
let lastMenus: Menu[] = [];

function visible(element: Element): boolean {
  return typeof element.checkVisibility === 'function'
    ? element.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    : true;
}

const linksOf = (element: Element) => [...element.querySelectorAll('a[href]')];

/** Nom du menu : l'aria-label d'un de ses boutons, sinon leur texte lisible (hors icônes aria-hidden). */
function labelOf(toggles: Element[]): string {
  const spoken = (toggle: Element) => {
    let text = '';
    const walker = document.createTreeWalker(toggle, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node && text.length < 60; node = walker.nextNode()) {
      if (node.parentElement?.closest('[aria-hidden="true"]')) continue;
      text += ` ${node.nodeValue ?? ''}`;
    }
    return text.replace(/\s+/g, ' ').trim();
  };
  const label =
    toggles.map((t) => t.getAttribute('aria-label')?.trim()).find(Boolean) ||
    toggles.map(spoken).find(Boolean) ||
    '';
  return redact(label).slice(0, 30);
}

/** Menus repliés : un panneau caché d'au moins 3 liens, ouvert par un bouton visible. */
function findMenus(): Menu[] {
  const menus: Menu[] = [];
  const add = (panel: Element | null, candidates: (Element | null)[]) => {
    if (!panel || !document.body?.contains(panel) || visible(panel)) return;
    // Le panneau est l'ancêtre caché le plus haut, juste sous un parent visible.
    let top = panel;
    while (top.parentElement && top.parentElement !== document.body && !visible(top.parentElement))
      top = top.parentElement;
    const toggles = candidates.filter((t): t is Element => !!t);
    // Sans bouton à l'écran, c'est le menu d'une autre mise en page (mobile) : on l'ignore.
    if (!toggles.some(visible)) return;
    const links = linksOf(top);
    if (links.length < MIN_LINKS || links.length > MAX_LINKS) return;
    if (menus.some((m) => m.panel.contains(top) || top.contains(m.panel))) return;
    menus.push({ panel: top, toggles, links, label: labelOf(toggles) });
  };

  // Case à cocher (Wikipédia/Vector) : le panneau est un frère suivant, ouvert par :checked.
  for (const box of document.querySelectorAll('input[type="checkbox"]')) {
    const label = box.id
      ? document.querySelector(`label[for="${CSS.escape(box.id)}"]`)
      : box.closest('label');
    for (let sibling = box.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
      if (sibling === label || (label && sibling.contains(label))) continue;
      if (!visible(sibling) && linksOf(sibling).length >= MIN_LINKS) {
        add(sibling, [label, box]);
        break;
      }
    }
  }
  // Bouton ARIA : aria-controls désigne le panneau.
  for (const button of document.querySelectorAll('[aria-expanded="false"][aria-controls]')) {
    const id = button.getAttribute('aria-controls')?.trim().split(/\s+/)[0];
    add(id ? document.getElementById(id) : null, [button]);
  }

  const hinted = (menu: Menu) =>
    menu.toggles.some((t) =>
      HINT.test(
        `${t.id} ${t.className} ${t.getAttribute('aria-label') ?? ''} ${textSample(t, 30)}`,
      ),
    );
  return menus
    .map((menu, order) => ({
      menu,
      order,
      score: (hinted(menu) ? 2 : 0) + (menu.links.length >= 6 ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, MAX_MENUS)
    .map(({ menu }) => menu);
}

const selectorOf = (element: Element): string | null => buildSelectors(element)[0] ?? null;

/** Section « Collapsed menus » de l'instantané design ; mémorise les menus pour `menuBarCss`. */
export function describeMenus(): string {
  lastMenus = findMenus();
  return lastMenus
    .map((menu, i) => {
      const toggle = menu.toggles.find(visible);
      const toggleSelector = toggle ? selectorOf(toggle) : null;
      const texts = menu.links
        .map((a) => redact((a.textContent ?? '').replace(/\s+/g, ' ').trim()).slice(0, 24))
        .filter(Boolean);
      const panel = selectorOf(menu.panel);
      return [
        `- [menu ${i + 1}]${menu.label ? ` "${menu.label}"` : ''}`,
        toggleSelector ? ` (toggle "${toggleSelector}")` : '',
        `: ${menu.links.length} links — ${texts.slice(0, 8).join(' · ')}${texts.length > 8 ? ' · …' : ''}`,
        panel ? `; panel "${panel}"` : '',
      ].join('');
    })
    .join('\n');
}

type Declarations = Record<string, string>;

/** Sélecteur qui vise exactement `elements` (signature commune dans `scope`), sinon un par élément. */
function selectorsFor(elements: Element[], scope: string): string[] | null {
  const first = elements[0];
  if (!first) return [];
  const classes = stableClasses(first).slice(0, 2);
  const signature = `${first.tagName.toLowerCase()}${classes.length ? `.${classes.join('.')}` : ''}`;
  const shared = `${scope} ${signature}`;
  try {
    const matches = isSafeSelector(shared) ? [...document.querySelectorAll(shared)] : [];
    if (matches.length === elements.length && elements.every((e) => matches.includes(e)))
      return [shared];
  } catch {
    /* sélecteur invalide : un sélecteur par élément */
  }
  const each = elements.map(selectorOf);
  return each.every((s): s is string => !!s) ? each : null;
}

function rule(selectors: string[], declarations: Declarations): string {
  const body = Object.entries(declarations)
    .map(([property, value]) => `${property}:${value}`)
    .join(';');
  return selectors.length && body ? `${selectors.join(',')}{${body}}` : '';
}

/**
 * CSS qui montre le menu n (1-based) en barre horizontale sous sa rangée : panneau révélé en
 * position absolue sous la rangée, une marge de la hauteur de la barre pour pousser le contenu,
 * listes de liens en ligne, bouton et intitulés cachés. Vérifié (liens visibles), sinon null.
 */
export function menuBarCss(index: number): string | null {
  const menu = lastMenus[index - 1];
  if (!menu || !menu.panel.isConnected) return null;
  const panel = selectorOf(menu.panel);
  if (!panel) return null;

  // Rangée assez large pour accueillir la barre, et les enveloppes étroites entre les deux.
  const between: Element[] = [];
  let row = menu.panel.parentElement;
  while (row && row !== document.body && row.getBoundingClientRect().width < innerWidth * 0.5) {
    between.push(row);
    row = row.parentElement;
  }
  if (!row || row === document.body) return null;
  const rowStyle = getComputedStyle(row);
  // Une rangée fixe ne pousse pas le contenu : la barre le recouvrirait.
  if (
    rowStyle.position === 'fixed' ||
    between.some((e) => getComputedStyle(e).position === 'fixed')
  )
    return null;
  const rowSelector = selectorOf(row);
  if (!rowSelector) return null;

  // Listes de liens, leur plus proche ancêtre commun, et les intitulés sans lien sur le chemin.
  const lists = [...new Set(menu.links.map((a) => a.closest('ul, ol') ?? a.parentElement!))].filter(
    (list) => menu.panel.contains(list),
  );
  let common: Element = lists[0] ?? menu.panel;
  while (!lists.every((list) => common.contains(list)) && common.parentElement)
    common = common.parentElement;
  if (!menu.panel.contains(common)) common = menu.panel;
  const onPath = new Set<Element>();
  for (const list of lists)
    for (let e: Element | null = list; e && e !== common.parentElement; e = e.parentElement)
      onPath.add(e);
  const extras: Element[] = [];
  for (const element of onPath) {
    if (lists.includes(element)) continue;
    for (const child of element.children) {
      if (!onPath.has(child) && !child.querySelector('a[href]') && child.textContent?.trim())
        extras.push(child);
    }
  }

  const commonSelector = selectorOf(common);
  const listSelectors = commonSelector ? selectorsFor(lists, commonSelector) : null;
  const extraSelectors = commonSelector ? selectorsFor(extras, commonSelector) : null;
  const toggleSelectors = menu.toggles.map(selectorOf);
  if (!listSelectors || !extraSelectors || toggleSelectors.some((s) => !s)) return null;

  // Aligne la barre sur le contenu de la rangée (le logo, le bouton…).
  const rowRect = row.getBoundingClientRect();
  const firstChild = [...row.children].find(visible);
  const inset = firstChild
    ? Math.max(0, Math.min(200, Math.round(firstChild.getBoundingClientRect().left - rowRect.left)))
    : 0;

  const rules = [
    rule(toggleSelectors as string[], { display: 'none' }),
    rule(extraSelectors, { display: 'none' }),
    rule([rowSelector], {
      ...(rowStyle.position === 'static' ? { position: 'relative' } : {}),
      ...(rowStyle.overflow !== 'visible' ? { overflow: 'visible' } : {}),
    }),
    ...between.map((wrapper) => {
      const s = getComputedStyle(wrapper);
      const selector = selectorOf(wrapper);
      const declarations: Declarations = {};
      // Une enveloppe positionnée deviendrait le repère du panneau (barre de 32 px de large).
      if (s.position === 'relative' || s.position === 'absolute' || s.position === 'sticky')
        declarations.position = 'static';
      if (s.transform !== 'none') declarations.transform = 'none';
      if (s.overflow !== 'visible') declarations.overflow = 'visible';
      return selector ? rule([selector], declarations) : '';
    }),
    rule([panel], {
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      position: 'absolute',
      top: '100%',
      bottom: 'auto',
      left: '0',
      right: '0',
      width: 'auto',
      height: 'auto',
      'min-width': '0',
      'max-width': 'none',
      'max-height': 'none',
      overflow: 'visible',
      margin: '0',
      padding: `4px ${inset}px`,
      transform: 'none',
      transition: 'none',
      'box-shadow': 'none',
      border: '0',
      'z-index': '3',
    }),
    common !== menu.panel
      ? rule([commonSelector!], {
          display: 'flex',
          'flex-wrap': 'wrap',
          'align-items': 'center',
          'column-gap': '24px',
          'row-gap': '4px',
          width: 'auto',
        })
      : '',
    rule(listSelectors, {
      display: 'flex',
      'flex-wrap': 'wrap',
      'align-items': 'center',
      'column-gap': '16px',
      'row-gap': '4px',
      margin: '0',
      padding: '0',
    }),
  ].filter(Boolean);

  // Mesure de la barre (synchrone : rien n'est peint), puis la marge qui pousse le contenu.
  const probe = document.createElement('style');
  probe.textContent = rules.join('\n');
  document.documentElement.appendChild(probe);
  try {
    const height = Math.ceil(menu.panel.getBoundingClientRect().height);
    const shown = menu.links.filter(visible).length;
    if (height < 10 || shown < menu.links.length * 0.8) return null;
    const margin = Math.round(parseFloat(rowStyle.marginBottom) || 0) + height;
    return [...rules, rule([rowSelector], { 'margin-bottom': `${margin}px` })].join('\n');
  } finally {
    probe.remove();
  }
}
