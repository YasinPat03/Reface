import { cssForSection, readCompiled, sectionOf, type CompiledCss } from '../shared/section';
// Injecteur document_start (PRD §3). Chemin critique du rejeu : AUCUN appel au service worker,
// lecture directe de chrome.storage.local, zéro dépendance. Doit rester minuscule.
(() => {
  const host = location.hostname;
  const cssKey = `css:${host}`;
  const pagesKey = `page-css:${host}`;
  const accessibilityKey = `accessibility-css:${host}`;
  const globalAccessibilityKey = 'accessibility-css:global';
  let globalAccessibilityCss: string | undefined;
  let accessibilityCss = '';
  const pausedKey = `paused:${host}`;
  const STYLE_ID = 'bp-styles';

  let compiled: CompiledCss = {};
  let section = sectionOf(location.pathname);
  let pages: Record<string, string> = {};
  let path = location.origin + location.pathname;
  let paused = false;
  let style: HTMLStyleElement | null = null;

  function render(): void {
    const pageCss =
      Object.hasOwn(pages, path) && typeof pages[path] === 'string' ? pages[path] : '';
    const text = paused
      ? ''
      : [cssForSection(compiled, section), pageCss, globalAccessibilityCss ?? accessibilityCss]
          .filter(Boolean)
          .join('\n');
    if (!text && !style) return; // rien à injecter : on ne touche pas au DOM
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
    }
    if (style.textContent !== text) style.textContent = text;
    // Mode « Original » activé depuis le panel (attribut posé par le content script).
    style.disabled = document.documentElement.hasAttribute('data-bp-original');
    // <head> n'existe peut-être pas encore : documentElement suffit.
    if (!style.isConnected) document.documentElement.appendChild(style);
  }

  chrome.storage.local
    .get([cssKey, pagesKey, pausedKey, accessibilityKey, globalAccessibilityKey])
    .then((data) => {
      globalAccessibilityCss =
        typeof data[globalAccessibilityKey] === 'string' ? data[globalAccessibilityKey] : undefined;
      accessibilityCss = typeof data[accessibilityKey] === 'string' ? data[accessibilityKey] : '';
      compiled = readCompiled(data[cssKey]);
      pages =
        data[pagesKey] && typeof data[pagesKey] === 'object'
          ? (data[pagesKey] as Record<string, string>)
          : {};
      paused = data[pausedKey] === true;
      render();
    });

  // Mise à jour live (Keep, toggle, pause) sans recharger la page.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (globalAccessibilityKey in changes)
      globalAccessibilityCss =
        typeof changes[globalAccessibilityKey]?.newValue === 'string'
          ? changes[globalAccessibilityKey].newValue
          : undefined;
    if (accessibilityKey in changes)
      accessibilityCss =
        typeof changes[accessibilityKey]?.newValue === 'string'
          ? changes[accessibilityKey].newValue
          : '';
    if (cssKey in changes) compiled = readCompiled(changes[cssKey]?.newValue);
    if (pagesKey in changes)
      pages = (changes[pagesKey]?.newValue as Record<string, string> | undefined) ?? {};
    if (pausedKey in changes) paused = changes[pausedKey]?.newValue === true;
    if (
      cssKey in changes ||
      pagesKey in changes ||
      pausedKey in changes ||
      accessibilityKey in changes ||
      globalAccessibilityKey in changes
    )
      render();
  });

  // SPA navigations change the URL without reloading this isolated script.
  const followPage = () => {
    if (path !== location.origin + location.pathname) {
      path = location.origin + location.pathname;
      section = sectionOf(location.pathname);
      render();
    }
  };
  addEventListener('popstate', followPage);
  (window as { navigation?: EventTarget }).navigation?.addEventListener(
    'navigatesuccess',
    followPage,
  );
  setInterval(followPage, 250);

  // Une fois le DOM construit, on passe en dernier pour gagner à spécificité égale,
  // et on se réinsère si un framework réécrit le document.
  document.addEventListener('DOMContentLoaded', () => {
    if (style) document.documentElement.appendChild(style);
    new MutationObserver(() => {
      if (style && !style.isConnected) document.documentElement.appendChild(style);
    }).observe(document.documentElement, { childList: true });
  });
})();
