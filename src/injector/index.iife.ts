// Injecteur document_start (PRD §3). Chemin critique du rejeu : AUCUN appel au service worker,
// lecture directe de chrome.storage.local, zéro dépendance lourde. Doit rester minuscule.
import { cssForSection, readCompiled, sectionOf, type CompiledCss } from '../shared/section';

(() => {
  const host = location.hostname;
  const cssKey = `css:${host}`;
  const pausedKey = `paused:${host}`;
  const STYLE_ID = 'bp-styles';

  let compiled: CompiledCss = {};
  let section = sectionOf(location.pathname);
  let paused = false;
  let style: HTMLStyleElement | null = null;

  function render(): void {
    const text = paused ? '' : cssForSection(compiled, section);
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

  chrome.storage.local.get([cssKey, pausedKey]).then((data) => {
    compiled = readCompiled(data[cssKey]);
    paused = data[pausedKey] === true;
    render();
  });

  // Mise à jour live (Keep, toggle, pause) sans recharger la page.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (cssKey in changes) compiled = readCompiled(changes[cssKey]?.newValue);
    if (pausedKey in changes) paused = changes[pausedKey]?.newValue === true;
    if (cssKey in changes || pausedKey in changes) render();
  });

  // Sites SPA (YouTube…) : le chemin change sans rechargement. On suit la section courante.
  const followSection = () => {
    const next = sectionOf(location.pathname);
    if (next !== section) {
      section = next;
      render();
    }
  };
  addEventListener('popstate', followSection);
  (window as { navigation?: EventTarget }).navigation?.addEventListener(
    'navigatesuccess',
    followSection,
  );
  setInterval(followSection, 800); // filet de sécurité : comparaison de chaîne, coût négligeable

  // Une fois le DOM construit, on passe en dernier pour gagner à spécificité égale,
  // et on se réinsère si un framework réécrit le document.
  document.addEventListener('DOMContentLoaded', () => {
    if (style) document.documentElement.appendChild(style);
    new MutationObserver(() => {
      if (style && !style.isConnected) document.documentElement.appendChild(style);
    }).observe(document.documentElement, { childList: true });
  });
})();
