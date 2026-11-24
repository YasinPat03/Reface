---
name: wikipedia
kind: site
hosts: wikipedia.org
description: Wikipedia Vector 2022 skin: header, collapsed main menu, TOC, article parts, references.
verify: https://en.wikipedia.org/wiki/Golden_ratio https://fr.wikipedia.org/wiki/Nombre_d%27or
---

Wikipedia uses the Vector 2022 skin on desktop (body.skin-vector-2022), with the same structure in every language (en., fr., de.…) and translated labels.

Structure: header.vector-header (logo .mw-logo, the hamburger #vector-main-menu-dropdown, search #p-search, user links .vector-user-links with donate/create account/log in), then .mw-page-container with the table of contents (#mw-panel-toc / .vector-toc, pinned in the left column or collapsed), the article main#content.mw-body, and the right column .vector-column-end (appearance settings #vector-appearance).

Article: title #firstHeading in header.mw-body-header; tabs .vector-page-toolbar (#p-associated-pages: Article/Talk; #p-views: Read/Edit/History); language button #p-lang-btn ("91 languages"); body #mw-content-text > .mw-parser-output: paragraphs p, section headings .mw-heading (wrapping an h2/h3 with an id), the infobox table .infobox (floating right), figures (figure, .thumb), hatnotes .hatnote, navboxes .navbox at the end, the reference list .mw-references-wrap, citation numbers in the text sup.reference, categories #catlinks, footer #footer.

Section edit links .mw-editsection ("[edit]", "[modifier]") exist only on editable pages, not on protected ones.

Main menu: its links live in #vector-main-menu, hidden until the hamburger is opened (see Collapsed menus).

Width: the limited-width preference caps the page (.mw-page-container) and the article; to widen the text, override max-width on .mw-page-container, .mw-content-container and .vector-body.

Custom dark theme: repaint body, .mw-page-container, header.vector-header, .vector-sticky-header, .infobox, tables (.wikitable), .navbox and links (a, a:visited). Wikipedia also has a native night mode (html.skin-theme-clientpref-night).

Never hide main#content, .mw-parser-output or .mw-page-container: they hold the article.

```components
Header | header, top bar, en-tête, barre du haut, bandeau | header.vector-header | one
Logo | logo | .mw-logo | one
Main menu (hamburger) | hamburger, main menu, menu principal, menu | #vector-main-menu-dropdown | one
Search | search, search bar, recherche, barre de recherche | #p-search | one
User links | login, log in, connexion, se connecter, create account, créer un compte, user links | .vector-header .vector-user-links | one
Donate link | donate, faire un don, don, dons | #pt-sitesupport-2 | one
Table of contents | table of contents, toc, contents, sommaire, table des matières | #mw-panel-toc ; .vector-toc | one
Article title | title, titre, heading, titre principal, main title | #firstHeading | one
Page tabs | tabs, onglets, history, historique, talk, discussion, read, lire | .vector-page-toolbar | one
Language button | languages, langues, language, langue, lang | #p-lang-btn | one
Article text | text, texte, article, paragraphs, paragraphes, body text | #mw-content-text .mw-parser-output p | all
Section headings | headings, section titles, titres de section, sous-titres, intertitres | .mw-heading | all
Edit links | edit links, edit, modifier, liens modifier, [edit] | .mw-editsection | all
Infobox | infobox, summary box, info box, encadré, boîte, résumé | .infobox | one
Images and figures | images, figures, photos, pictures, illustrations | .mw-parser-output figure, .mw-parser-output .thumb | all
Hatnotes | hatnote, hatnotes, homonymie, notes en tête | .hatnote | all
Reference numbers | reference numbers, citation numbers, numéros de référence, appels de note, renvois, [1] | sup.reference | all
References list | references, références, notes, bibliography, bibliographie, sources | .mw-references-wrap | all
Navboxes | navbox, navboxes, navigation boxes, boîtes de navigation | .navbox | all
Categories | categories, catégories | #catlinks | one
Right column | appearance, apparence, right column, colonne de droite, text size, taille du texte | .vector-column-end | one
Footer | footer, pied de page | #footer | one
```
