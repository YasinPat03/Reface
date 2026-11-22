// Résultats de recherche construits comme YouTube (fin 2026) : cartes horizontales (miniature à
// gauche, min-width 240 px et width 500 px, texte à droite), titres coupés à 2 lignes par
// line-clamp, un id #dismissible réutilisé dans des éléments imbriqués, et dans le même conteneur
// une playlist en pleine largeur et une étagère de Shorts. Classes longues en camelCase.
const THUMB =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='9'%3E%3Crect width='16' height='9' fill='%23c4302b'/%3E%3C/svg%3E";

const video = (i: number) => `
<ytd-video-renderer class="style-scope ytd-item-section-renderer">
  <div id="dismissible" class="style-scope ytd-video-renderer">
    <ytd-thumbnail class="style-scope ytd-video-renderer"><a id="thumbnail" class="yt-simple-endpoint inline-block style-scope ytd-thumbnail" href="/watch?v=${i}"><img class="ytCoreImageHost ytCoreImageFillParentWidth" src="${THUMB}" alt=""></a><div id="overlays" class="style-scope ytd-thumbnail"><span class="time">1${i}:3${i}</span></div></ytd-thumbnail>
    <div class="text-wrapper style-scope ytd-video-renderer">
      <h3 class="title-wrapper"><a id="video-title" class="yt-simple-endpoint style-scope ytd-video-renderer" href="/watch?v=${i}"><yt-formatted-string class="style-scope ytd-video-renderer">Lofi hip hop radio number ${i} — beats to relax, study, sleep and work to, with a title long enough to need three lines</yt-formatted-string></a></h3>
      <div id="metadata-line" class="style-scope ytd-video-renderer"><span class="inline-metadata-item style-scope">${i + 2}M views</span><span class="inline-metadata-item style-scope">${i + 1} years ago</span></div>
      <div class="channel-name style-scope ytd-video-renderer">Channel ${i}</div>
      <ytd-badge-supported-renderer class="style-scope ytd-video-renderer"><div id="dismissible" class="badge style-scope ytd-badge-supported-renderer">4K</div></ytd-badge-supported-renderer>
    </div>
  </div>
</ytd-video-renderer>`;

const playlist = `
<yt-lockup-view-model class="ytd-item-section-renderer lockup">
  <div class="ytLockupViewModelHost ytLockupViewModelHorizontal">
    <a class="ytLockupViewModelContentImage" href="/playlist"><img class="ytCoreImageHost" src="${THUMB}" alt=""></a>
    <div class="ytLockupViewModelMetadata"><h3 class="ytLockupMetadataViewModelHeadingReset">Mix — cozy autumn music</h3><div class="ytLockupMetadataViewModelMetadata">LoFi Girl and more · Playlist</div></div>
  </div>
</yt-lockup-view-model>`;

const short = (i: number) =>
  `<div class="ytGridShelfViewModelGridShelfItem"><img class="ytCoreImageHost" src="${THUMB}" alt=""><h3 class="shortsLockupViewModelHostMetadataTitle">Short number ${i}</h3></div>`;
const shelf = `<grid-shelf-view-model class="ytGridShelfViewModelHost"><h2>Shorts</h2><div class="ytGridShelfViewModelGridShelfRow">${[1, 2, 3, 4, 5].map(short).join('')}</div></grid-shelf-view-model>`;

// Les résultats sont répartis en sections (vidéos coupées en deux par une section de recherches
// associées) : la liste des sections englobe celle des vidéos et la dépasse en surface, mais c'est
// la liste des vidéos qu'il faut mettre en grille, dans chacune de ses sections.
const section = (content: string) =>
  `<ytd-item-section-renderer class="style-scope ytd-section-list-renderer"><div id="header" class="style-scope ytd-item-section-renderer"></div><div id="contents" class="style-scope ytd-item-section-renderer">${content}</div></ytd-item-section-renderer>`;
const related = (i: number) =>
  section(
    `<div class="related">Related search ${i}: <a href="/results?q=${i}">lofi ${i}</a></div>`,
  );

const items = Array.from({ length: 12 }, (_, i) => video(i + 1));
items.splice(2, 0, playlist);
items.splice(8, 0, shelf);

export const VIDEO_RESULTS_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>lofi music - Tube</title>
<style>
body{margin:0;font-family:Roboto,Arial,sans-serif;background:#fff;color:#0f0f0f}
#masthead{display:flex;align-items:center;height:56px;padding:0 16px;gap:16px}
ytd-item-section-renderer{display:block;max-width:1160px;margin:0 auto;padding:0 24px}
ytd-video-renderer{display:block;margin-top:16px}
#dismissible{display:flex}
ytd-thumbnail{display:block;position:relative;flex:1 1 1e-9px;min-width:240px;max-width:500px;width:500px;margin-right:16px}
ytd-thumbnail img{display:block;width:100%;aspect-ratio:16/9;border-radius:12px}
#overlays{position:absolute;right:8px;bottom:8px;background:#000c;color:#fff;font-size:12px;padding:2px 4px}
.text-wrapper{flex:1;min-width:0}
.title-wrapper{margin:0}
#video-title{color:#0f0f0f;text-decoration:none}
#video-title yt-formatted-string{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:18px;line-height:26px;max-height:52px}
#metadata-line,.channel-name{font-size:12px;color:#606060}
.badge{display:inline-block;font-size:12px;background:#f2f2f2;padding:0 4px}
.ytLockupViewModelHost{display:flex;margin-top:16px}
.ytLockupViewModelContentImage{flex:none;width:500px;max-width:500px;margin-right:16px}
.ytLockupViewModelContentImage img{display:block;width:100%;aspect-ratio:16/9}
.ytLockupViewModelMetadata{flex:1}
grid-shelf-view-model{display:block;margin-top:24px}
.ytGridShelfViewModelGridShelfRow{display:flex;gap:8px}
.ytGridShelfViewModelGridShelfItem{width:200px}
.ytGridShelfViewModelGridShelfItem img{width:200px;aspect-ratio:9/16;display:block}
</style></head><body>
<header id="masthead" role="banner"><a href="/">Tube</a><input aria-label="Search" value="lofi music"></header>
<ytd-section-list-renderer><div id="contents" class="style-scope ytd-section-list-renderer">
${section(items.slice(0, 6).join(''))}${related(1)}${section(items.slice(6).join(''))}${related(2)}${related(3)}
</div></ytd-section-list-renderer>
</body></html>`;
