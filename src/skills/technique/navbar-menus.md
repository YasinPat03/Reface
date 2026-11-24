---
name: navbar-menus
kind: technique
triggers: \b(?:navbar|nav bar|menu|menus|hamburger|navigation|barre de navigation|onglets?|tabs|dropdown|liens du haut)\b
description: Menus and navigation bars: collapsed menus as a bar (menuBar), horizontal link rows, tabs, spacing.
---
- A collapsed menu (hamburger, dropdown) listed under "Collapsed menus" becomes a permanent horizontal bar with "menuBar": n. The extension reveals the panel under its row, lays out the links and hides the toggle: never hand-write that reveal (visibility, opacity, position, transform) in css.
- Extra styling of that bar (colors, font, gap, padding) goes in "css" with the panel selector from the snapshot.
- A visible vertical list of links turned into a row: the list (ul/ol) gets display:flex; flex-wrap:wrap; gap; its items lose bullets (list-style:none) and the column it sits in may need width:auto.
- Tabs and link bars: style the links themselves (a, [role="tab"]) for color and spacing; a container color does not reach links that set their own.
- Keep the menu usable: never hide the only navigation or the search unless asked; keep focus outlines.
- A sticky navbar needs position:sticky; top:0; a z-index above the content; and an opaque background.
