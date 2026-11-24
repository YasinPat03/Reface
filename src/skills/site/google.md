---
name: google
kind: site
hosts: google.com google.fr google.ca google.co.uk google.de google.es google.it google.be google.ch
description: Google Search results page: stable ids (#rso, #tads, #rhs), obfuscated classes, ads, knowledge panel.
verify: https://www.google.com/search?q=golden+ratio&hl=en
---

Google Search (/search) mixes stable ids with obfuscated class names that change often (MjjYud, VwiC3b, LC20lb…): prefer ids, roles, data attributes and tag structure.

Layout: the search form #searchform (logo, query box textarea[name="q"]), the result-type tabs (#hdtb or div[role="navigation"]: All, Images, Videos, News…), then #rcnt with the results column #center_col (#rso = organic results, #tads = top ads, #bottomads = bottom ads, #botstuff = related searches and pagination) and the knowledge panel on the right #rhs. Footer: #footcnt / #fbar.

A result is a block inside #rso: its title is an h3 inside a link (a h3), its URL breadcrumb a cite, and a snippet below. Rich blocks: "People also ask" (.related-question-pair), "Top stories", video and image carousels, AI overviews at the top (labelled "AI Overview").

Sponsored results are inside #tads and #bottomads (each with a "Sponsored" label).

Class names are not reliable for repeated results: use "#rso h3" for titles and "#rso cite" for URLs.

Custom dark theme: repaint body, #searchform, #rcnt, #rhs and link colors (h3, a:visited h3). Google also has a native dark theme.

Never hide #search or #rso as a whole when asked to hide one block.

```components
Search bar | search, search bar, recherche, barre de recherche | #searchform | one
Result tabs | tabs, onglets, result tabs | #hdtb ; div[role="navigation"] | one
Results | results, résultats, search results | #rso | one
Result titles | titles, titres, links, liens | #rso h3 | all
Result URLs | urls, url, addresses, adresses, breadcrumbs | #rso cite | all
Top ads | ads, ad, sponsored, sponsorisés, pubs, publicités, annonces | #tads | one
Bottom ads | bottom ads, pubs du bas | #bottomads | one
Knowledge panel | knowledge panel, right panel, panneau de droite, sidebar, fiche | #rhs | one
People also ask | people also ask, autres questions, questions associées | .related-question-pair | all
Related searches | related searches, recherches associées, pagination | #botstuff | one
Footer | footer, pied de page | #footcnt ; #fbar | one
```
