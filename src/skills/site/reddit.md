---
name: reddit
kind: site
hosts: reddit.com
description: New Reddit (shreddit custom elements with shadow DOM): header, rails, posts, comments, promoted posts.
verify: https://www.reddit.com/r/programming/ https://www.reddit.com/r/AskReddit/comments/1lvx5w7/
---

New Reddit ("shreddit") is built from custom elements, many with a shadow root: page CSS cannot reach INSIDE a shadow root, only the host element itself (size, margin, display, background, and inherited color/font). Target the custom elements (shreddit-post, shreddit-comment…) and their light-DOM slots ([slot="title"], [slot="text-body"], [slot="credit-bar"]). old.reddit.com is a different, classic HTML site (.thing, .link, .comment, .side).

Page types (path): "/" and "/r/<name>/" feeds, "/r/<name>/comments/…" post pages, "/user/…" profiles.

Layout: reddit-header-large (top bar: logo, search reddit-search-large, #login-button), left navigation #left-sidebar-container, main#main-content, right rail #right-sidebar-container (community info aside[aria-label="Community information"], sidebar ads shreddit-sidebar-ad).

Feed: shreddit-feed with one shreddit-post per post (title [slot="title"], thumbnail [data-testid="post-thumbnail"], media shreddit-player / gallery-carousel). Promoted posts are shreddit-ad-post. Subreddit banner and header: shreddit-subreddit-header.

Post page: the post shreddit-post (title h1[id^="post-title"]), the comment box faceplate-textarea-input, then shreddit-comment-tree#comment-tree with nested shreddit-comment elements (text in [slot="comment"]). Related posts on the right: pdp-right-rail.

Ids such as t3_1xyz belong to one post: never use them.

Custom dark theme: repaint body, shreddit-app, reddit-header-large, main, both rails and post backgrounds (shreddit-post); text inside shadow roots inherits color from its host.

```components
Top bar | header, top bar, barre du haut, en-tête, bandeau | reddit-header-large | one
Search | search, search bar, recherche, barre de recherche | reddit-search-large | one
Left navigation | left sidebar, sidebar, menu, navigation, barre latérale, menu de gauche | #left-sidebar-container | one
Right rail | right sidebar, right column, right rail, colonne de droite, sidebar droite | #right-sidebar-container | one
Community info | community info, about community, infos de la communauté, à propos | aside[aria-label="Community information"] | one
Subreddit header | banner, bannière, subreddit header, en-tête du subreddit | shreddit-subreddit-header | one
Posts | posts, publications, feed, fil, cards, cartes, articles | shreddit-post | all
Promoted posts | ads, ad, promoted, sponsored, pubs, publicités, sponsorisé | shreddit-ad-post, shreddit-sidebar-ad | all
Post titles | titles, titres, post titles | shreddit-post [slot="title"] | all
Thumbnails | thumbnails, miniatures, images, vignettes | [data-testid="post-thumbnail"] | all
Videos and galleries | videos, vidéos, galleries, galeries, media, médias | shreddit-player, gallery-carousel | all
Comments | comments, commentaires, replies, réponses, comment section | shreddit-comment-tree | one
Comment | comment, commentaire | shreddit-comment | all
Related posts | related posts, related, publications liées, suggestions | pdp-right-rail | one
Sort menu | sort, trier, tri, sort dropdown | shreddit-sort-dropdown | one
```
