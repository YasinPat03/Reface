---
name: x
kind: site
hosts: x.com twitter.com
description: X (Twitter): logged-in React app with data-testid hooks, virtualized timeline, right column.
verify: https://x.com/NASA
---

X (Twitter) serves two different apps. Logged in (the usual case): a React app with stable data-testid attributes and hashed css-… / r-… class names (never use those). Logged out: a simpler public page with utility classes, where only landmarks (main, aside, nav) are reliable.

Logged-in layout: header[role="banner"] (left navigation, nav[aria-label="Primary"]), main[role="main"] with [data-testid="primaryColumn"] (the timeline), and [data-testid="sidebarColumn"] on the right (search, trends "What's happening", "Who to follow").

Posts: article[data-testid="tweet"] (text [data-testid="tweetText"], author [data-testid="User-Name"], media [data-testid="tweetPhoto"] / [data-testid="videoPlayer"], action bar [role="group"] with reply/repost/like). Timelines are virtualized: posts are absolutely positioned inside div[aria-label^="Timeline"], so never change their position or height by hand; style colors, fonts and spacing inside the article, or hide.

Right column: trends [aria-label="Timeline: Trending now"], who to follow aside[aria-label="Who to follow"], search form[role="search"]. Composer: [data-testid="tweetTextarea_0"].

Promoted posts carry an "Ad" label inside the article, with no stable attribute: find them by that label.

Custom dark theme: X has native Dim and Lights out themes (the body background is set inline); for a custom theme repaint body, header[role="banner"], both columns and the article backgrounds and borders.

```components
Left navigation | menu, navigation, left sidebar, menu de gauche, barre latérale | header[role="banner"] | one
Timeline | timeline, feed, fil, posts column, fil d'actualité | [data-testid="primaryColumn"] ; main | one
Right column | right sidebar, sidebar, right column, colonne de droite | [data-testid="sidebarColumn"] ; aside | one
Posts | posts, tweets, publications | article[data-testid="tweet"] | all
Post text | text, texte, tweet text | [data-testid="tweetText"] | all
Post media | images, photos, media, médias, pictures, videos, vidéos | [data-testid="tweetPhoto"], [data-testid="videoPlayer"] | all
Action bar | actions, likes, retweets, reposts, replies, buttons, boutons | article[data-testid="tweet"] [role="group"] | all
Trends | trends, trending, tendances, what's happening | [aria-label="Timeline: Trending now"] | one
Who to follow | who to follow, suggestions, follow suggestions, suggestions de comptes | aside[aria-label="Who to follow"] | one
Composer | composer, post box, compose, écrire, rédiger | [data-testid="tweetTextarea_0"] | one
```
