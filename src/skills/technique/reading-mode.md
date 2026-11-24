---
name: reading-mode
kind: technique
triggers: \b(?:reading mode|reader mode|reader|focus mode|mode lecture|lecture|distraction\w*|zen|concentr\w*|[ée]pur\w*|clean article|article only|juste l.article)\b
description: Reading or focus mode: keep the article, hide the noise, center a comfortable text column.
---
- Split it into separate changes the user can toggle: "Hide distractions" (sidebars, ads, related links, banners; comments only if asked) and "Comfortable text" (column width, size, spacing).
- Keep the article whole: title, author/date line, body, its images and captions, tables and code. Hide around it, never inside it.
- Center one column: the article container gets max-width:70ch (or 680-760px), margin-left/right:auto; neighbours that took space (sidebars, TOC column) are hidden or the grid/flex parent lets the article grow.
- Text: 18-20px, line-height 1.6-1.7, paragraphs with margin-bottom about 1em; images max-width:100%; height:auto.
- Calm colors: keep the site colors unless asked; for a soft page use an off-white background (#fbfaf7) and dark gray text (#222), checking 4.5:1 contrast.
- Sticky headers and floating buttons distract while reading: make them static or hide them (see the sticky guide).
