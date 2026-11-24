---
name: youtube
kind: site
hosts: youtube.com
description: YouTube pages (home, search, watch), custom elements, both card generations, Shorts, grid columns.
verify: https://www.youtube.com/results?search_query=lofi+music https://www.youtube.com/watch?v=dQw4w9WgXcQ https://www.youtube.com/watch?v=jfKfPfyJRdk https://www.youtube.com/
---

YouTube is a single-page app built from custom elements (ytd-_, yt-_-view-model). Ids repeat inside every card (#contents, #dismissible, #details, #meta, #thumbnail, #video-title, #channel-name): never use a repeated id alone, scope it (e.g. "ytd-video-renderer #video-title").

Page types (first path segment): "/" home feed (ytd-rich-grid-renderer; logged-out visitors may only get a nudge without videos), "results" search, "watch" video page, "@name" channels, "shorts" player.

Video cards come in two generations, often mixed on one page: renderers (ytd-rich-item-renderer on home, ytd-video-renderer on search, ytd-compact-video-renderer in older watch pages) and view models (yt-lockup-view-model, with yt-thumbnail-view-model and yt-lockup-metadata-view-model inside). Always target BOTH generations in one selector list.

Thumbnails (ytd-thumbnail, yt-thumbnail-view-model) are sized by their card: read "size limited by" in the media inventory and override those exact constraints.

Home grid columns: ytd-rich-grid-renderer reads the custom property --ytd-rich-grid-items-per-row (set it on ytd-rich-grid-renderer). Elsewhere use the theme columns token for "N per row".

Shorts: on search they are grid-shelf-view-model shelves containing ytm-shorts-lockup-view-model items; on home ytd-rich-shelf-renderer[is-shorts] or ytd-reel-shelf-renderer. The left guide also has a "Shorts" entry.

Watch page: ytd-watch-flexy > #columns with #primary (player #player, title/owner/actions in ytd-watch-metadata, description #description, comments ytd-comments#comments, loaded lazily and empty until scrolled) and #secondary (related videos: yt-lockup-view-model items in ytd-watch-next-secondary-results-renderer; live chat ytd-live-chat-frame on some streams).

Top bar: #masthead-container (fixed) holding ytd-masthead: logo, search box yt-searchbox, voice search #voice-search-button, buttons. Left navigation: tp-yt-app-drawer#guide (expanded) or ytd-mini-guide-renderer (collapsed rail).

Never hide ytd-app, #content, ytd-page-manager, #columns or #primary: they hold the whole page. Ads: ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, #masthead-ad.

Custom dark theme: repaint ytd-app, #masthead-container, ytd-masthead, #guide, ytd-mini-guide-renderer, card backgrounds, and the text of #video-title and metadata.

```components
Top bar | top bar, header, masthead, barre du haut, en-tête, entete, bandeau | #masthead-container ; ytd-masthead | one
Search box | search, search bar, search box, recherche, barre de recherche | yt-searchbox ; ytd-searchbox | one
Voice search button | micro, microphone, mic, voice, vocal, voice search, recherche vocale, bouton du micro | #voice-search-button | one
YouTube logo | logo | ytd-topbar-logo-renderer#logo | one
Left navigation | sidebar, side bar, menu, guide, navigation, barre latérale, menu de gauche | tp-yt-app-drawer#guide ; ytd-mini-guide-renderer | one
Filter chips | chips, filters, filtres, categories, catégories, tags, pastilles | ytd-feed-filter-chip-bar-renderer ; yt-chip-cloud-renderer | one
Home grid | grid, grille, feed, accueil, home | ytd-rich-grid-renderer | one
Video cards | videos, vidéos, video cards, cartes, cards, résultats, results | ytd-rich-item-renderer, ytd-video-renderer, yt-lockup-view-model, ytd-compact-video-renderer | all
Thumbnails | thumbnails, miniatures, images, pictures, photos, vignettes | ytd-thumbnail, yt-thumbnail-view-model | all
Video titles | titles, titres, video titles, titres des vidéos | ytd-video-renderer #video-title, ytd-rich-item-renderer #video-title, yt-lockup-metadata-view-model h3 | all
Shorts | shorts, short, courts, vidéos courtes, reels | grid-shelf-view-model:has(ytm-shorts-lockup-view-model), ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts] | all
Ads | ads, ad, pubs, publicités, sponsored, sponsorisé, annonces | ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, #masthead-ad | all
Player | player, lecteur, video player, vidéo principale | ytd-watch-flexy #player | one
Video title | title, titre, titre de la vidéo | ytd-watch-metadata #title h1 | one
Channel row | channel, chaîne, subscribe, s'abonner, abonnement, owner | ytd-watch-metadata #owner | one
Action buttons | likes, like, j'aime, share, partager, actions, download, télécharger | ytd-watch-metadata #actions | one
Description | description | ytd-watch-metadata #description | one
Comments | comments, commentaires, comment section | ytd-comments#comments | one
Related videos | suggestions, recommendations, recommandations, related, related videos, à suivre, up next, right column, colonne de droite | ytd-watch-flexy #secondary | one
Merch shelf | merch, produits, products, shopping, boutique | ytd-merch-shelf-renderer | one
```
