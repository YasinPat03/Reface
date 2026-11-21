// Injecteur document_start (PRD §3). Chemin critique du rejeu : AUCUN appel au service worker,
// lecture directe de chrome.storage.local, zéro dépendance. Doit rester minuscule.
(() => {
  const host = location.hostname;
  const cssKey = `css:${host}`;
  const pausedKey = `paused:${host}`;
  const STYLE_ID = 'bp-styles';

  let css = '';
  let paused = false;
  let style: HTMLStyleElement | null = null;

  function render(): void {
    const text = paused ? '' : css;
    if (!text && !style) return; // rien à injecter : on ne touche pas au DOM
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
    }
    if (style.textContent !== text) style.textContent = text;
    // <head> n'existe peut-être pas encore : documentElement suffit.
    if (!style.isConnected) document.documentElement.appendChild(style);
  }

  chrome.storage.local.get([cssKey, pausedKey]).then((data) => {
    css = typeof data[cssKey] === 'string' ? data[cssKey] : '';
    paused = data[pausedKey] === true;
    render();
  });

  // Mise à jour live (Keep, toggle, pause) sans recharger la page.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (cssKey in changes) css = (changes[cssKey]?.newValue as string | undefined) ?? '';
    if (pausedKey in changes) paused = changes[pausedKey]?.newValue === true;
    if (cssKey in changes || pausedKey in changes) render();
  });

  // Une fois le DOM construit, on passe en dernier pour gagner à spécificité égale,
  // et on se réinsère si un framework réécrit le document.
  document.addEventListener('DOMContentLoaded', () => {
    if (style) document.documentElement.appendChild(style);
    new MutationObserver(() => {
      if (style && !style.isConnected) document.documentElement.appendChild(style);
    }).observe(document.documentElement, { childList: true });
  });
})();
