// Encyclopédie fictive dont le menu principal est replié derrière un hamburger, construit comme
// Wikipédia (Vector 2022) : case à cocher transparente posée sur l'icône, panneau caché par
// visibility/opacity, en position absolue avec top/bottom imposés, max-width et overflow:auto,
// dans un en-tête flex de hauteur fixe. Une CSS « évidente » y empile les liens sur l'article.
const link = (id: string, text: string) => `<li id="${id}"><a href="/wiki/${id}">${text}</a></li>`;

const NAVIGATION = [
  ['n-mainpage', 'Main page'],
  ['n-contents', 'Contents'],
  ['n-current', 'Current events'],
  ['n-random', 'Random article'],
  ['n-about', 'About'],
  ['n-contact', 'Contact us'],
] as const;
const CONTRIBUTE = [
  ['n-help', 'Help'],
  ['n-learn', 'Learn to edit'],
  ['n-portal', 'Community portal'],
  ['n-recent', 'Recent changes'],
  ['n-upload', 'Upload file'],
] as const;

export const MENU_LINK_COUNT = NAVIGATION.length + CONTRIBUTE.length;

const PARAGRAPHS = Array.from(
  { length: 8 },
  (_, i) =>
    `<p>Paragraph ${i + 1}: two quantities are in the golden ratio if their ratio is the same as the ratio of their sum to the larger of the two quantities.</p>`,
).join('');

export const COLLAPSED_MENU_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Golden ratio — Encyclo</title>
<style>
body{margin:0;font-family:sans-serif;color:#202122}
.page-head{display:flex;height:66px;align-items:center;padding:0 44px;position:relative;z-index:3;border-bottom:1px solid #eaecf0}
.head-start{display:flex;align-items:center;gap:12px}
.logo{font-size:20px;font-weight:bold;color:#000;text-decoration:none}
.head-end{flex:1;display:flex;justify-content:flex-end;align-items:center;gap:12px}
.dropdown{position:relative}
.dropdown-checkbox{position:absolute;top:0;left:0;width:32px;height:32px;margin:0;opacity:0;cursor:pointer;z-index:1}
.dropdown-label{display:inline-flex;width:32px;height:32px;align-items:center;justify-content:center}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.dropdown-content{position:absolute;top:32px;bottom:0;left:-1px;min-width:200px;max-width:220px;overflow:auto;background:#fff;border:1px solid #a2a9b1;box-shadow:0 2px 6px rgba(0,0,0,.2);padding:8px 16px;visibility:hidden;opacity:0;transition:opacity .1s;z-index:50}
.dropdown-checkbox:checked ~ .dropdown-content{visibility:visible;opacity:1;bottom:auto}
.menu-heading{font-size:12px;color:#54595d;text-transform:uppercase;margin-top:8px}
.menu-list{list-style:none;margin:0;padding:0}
.menu-list li{padding:4px 0}
.menu-list a{color:#36c;text-decoration:none}
main{max-width:900px;margin:24px auto;padding:0 20px}
</style></head><body>
<header class="page-head" role="banner">
  <div class="head-start">
    <nav class="main-menu-landmark" aria-label="Site">
      <div id="main-menu-dropdown" class="dropdown">
        <input type="checkbox" id="main-menu-checkbox" class="dropdown-checkbox" aria-label="Main menu">
        <label id="main-menu-label" for="main-menu-checkbox" class="dropdown-label"><span aria-hidden="true">☰</span><span class="vh">Main menu</span></label>
        <div class="dropdown-content">
          <div id="main-menu" class="main-menu">
            <div class="pinnable-header">Main menu <button type="button">move to sidebar</button></div>
            <div id="p-navigation" class="portlet"><div class="menu-heading">Navigation</div><div class="menu-content"><ul class="menu-list">${NAVIGATION.map(([id, text]) => link(id, text)).join('')}</ul></div></div>
            <div id="p-interaction" class="portlet"><div class="menu-heading">Contribute</div><div class="menu-content"><ul class="menu-list">${CONTRIBUTE.map(([id, text]) => link(id, text)).join('')}</ul></div></div>
          </div>
        </div>
      </div>
    </nav>
    <a class="logo" href="/">Encyclo</a>
  </div>
  <div class="head-end"><input type="search" placeholder="Search Encyclo" aria-label="Search"><a href="/login">Log in</a></div>
</header>
<main><h1 id="firstHeading">Golden ratio</h1>${PARAGRAPHS}</main>
</body></html>`;
