// Page dont les cibles n'apparaissent PAS dans le plan envoyé au LLM :
// - un badge « Beta » minuscule (30×14 px, sous le seuil de surface du plan) ;
// - des étiquettes « Sponsored » dans les éléments 3 à 12 d'une liste (le plan n'en montre que 2) ;
// - une colonne latérale à largeur contrainte (pour inspect_regions) ;
// - un champ de recherche prérempli : sa valeur ne doit JAMAIS partir chez le fournisseur.

export const SECRET_VALUE = 'secret-valeur';
export const SPONSORED_COUNT = 10;

const items = Array.from(
  { length: 12 },
  (_, i) => `
    <li class="item">
      <a class="title" href="#t${i}">Growing tomatoes on a balcony, part ${i + 1}</a>
      <p class="meta">by gardener${i} · ${i + 2} replies</p>
      ${i >= 2 ? '<span class="tag">Sponsored</span>' : ''}
    </li>`,
).join('');

export const HIDDEN_TARGETS_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Garden forum</title>
<style>
  body { margin: 0; font: 15px/1.5 system-ui, sans-serif; color: #222; background: #fafafa; }
  header.top { display: flex; align-items: center; gap: 12px; padding: 12px 24px; background: #2f6f3e; color: #fff; }
  header.top .logo { font-weight: 700; font-size: 20px; }
  header.top .pill { display: inline-block; width: 30px; height: 14px; font-size: 9px; line-height: 14px;
    text-align: center; border-radius: 7px; background: #ffd54a; color: #222; overflow: hidden; }
  header.top input { margin-left: auto; padding: 6px 10px; }
  .layout { display: flex; gap: 24px; padding: 24px; }
  main { flex: 1; }
  ul.feed { list-style: none; margin: 0; padding: 0; }
  li.item { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; margin-bottom: 10px; }
  li.item .title { font-weight: 600; color: #1b4d2b; }
  li.item .meta { margin: 4px 0 0; color: #666; font-size: 13px; }
  .tag { display: inline-block; font-size: 10px; padding: 0 4px; border: 1px solid #c9a400; color: #7a6400; }
  aside#side { width: 300px; max-width: 300px; flex: 0 0 300px; background: #fff; border: 1px solid #ddd; padding: 16px; }
</style></head>
<body>
  <header class="top">
    <span class="logo">The community forum for balcony and window-box gardeners</span>
    <span class="pill">Beta</span>
    <input type="search" placeholder="Search the forum" value="${SECRET_VALUE}">
  </header>
  <div class="layout">
    <main>
      <h1>Latest discussions about small-space gardening</h1>
      <ul class="feed">${items}</ul>
    </main>
    <aside id="side">
      <h2>Forum rules</h2>
      <p>Be kind, share photos of your harvest and credit the seed suppliers you recommend.</p>
    </aside>
  </div>
</body></html>`;
