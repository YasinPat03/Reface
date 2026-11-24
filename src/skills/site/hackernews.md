---
name: hackernews
kind: site
hosts: news.ycombinator.com
description: Hacker News table layout: orange top bar, three-row stories, comment tree.
verify: https://news.ycombinator.com/ https://news.ycombinator.com/item?id=1
---

Hacker News is a 2000s table layout without semantic tags: everything is inside table#hnmain (centered, width 85%, background via the bgcolor attribute #f6f6ef).

Top bar: the first row's td[bgcolor="#ff6600"] (orange) holds .pagetop links (.hnname "Hacker News", new | past | comments | ask | show | jobs | submit, login on the right). Its color is an HTML bgcolor attribute: override it with background-color on that td.

Story list (front page, /news, /newest, /ask…): each story spans THREE sibling rows of one table: tr.athing.submission (rank .rank, vote arrow .votelinks, title .titleline > a, domain .sitebit), then the metadata row (td.subtext > .subline: .score, user, .age, comments link), then tr.spacer. Style or hide a story as those rows together ("tr.athing", "tr.athing + tr", "tr.spacer"). Never write display:grid/flex on the table by hand: use the theme columns token for grids.

Bottom: "More" link .morelink, then the footer links .yclinks and the search form (form[action="//hn.algolia.com/"]).

Comment pages (/item?id=…): the story .fatitem, then table.comment-tree with one tr.athing.comtr per comment; the indent is td.ind (an image width), the header .comhead (user, age, collapse toggle .togg), the text .commtext. Replies are flat rows, nested only by indent.

Text: fonts are Verdana set on td, .title, .subtext…: to resize, target .titleline, .subtext, .commtext directly.

Custom dark theme: repaint body, #hnmain, the orange top bar td, and the text of .titleline a, .subtext, .commtext and visited links.

```components
Top bar | top bar, header, orange bar, barre orange, barre du haut, en-tête, bandeau | #hnmain td[bgcolor="#ff6600"] | one
Site title | site title, logo, hacker news, nom du site | .hnname | one
Top links | top links, links, liens du haut, menu, nav, navigation | .pagetop | all
Stories | stories, posts, articles, links, liens, sujets, items, list, liste | tr.athing.submission | all
Story titles | titles, titres | .titleline > a | all
Rank numbers | ranks, rank, numbers, numéros, numérotation, rang | .rank | all
Vote arrows | votes, arrows, upvote, flèches, vote | .votelinks | all
Domains | domains, domain, site names, domaines, noms de domaine, sites | .sitebit | all
Metadata line | metadata, subtext, infos, métadonnées, comments count, author, auteur | td.subtext | all
Scores | points, score, scores | .score | all
More link | more, plus, next page, page suivante | .morelink | one
Footer | footer, pied de page, search, recherche | .yclinks | one
Comment tree | comments, commentaires, replies, réponses, discussion | table.comment-tree | one
Comment text | comment text, texte des commentaires | .commtext | all
```
