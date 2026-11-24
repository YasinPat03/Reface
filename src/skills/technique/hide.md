---
name: hide
kind: technique
triggers: \b(?:hide|hidden|remove|get rid|cache[rsz]?|cacher|masque[rsz]?|masquer|enl[eè]ve[rsz]?|supprime[rsz]?|retire[rsz]?|vire[rsz]?|sans les?)\b
description: Hide a part cleanly: smallest element, every repeated item, no leftover gap, nothing else hidden.
---
- Find the part first: site components, site map, request matches, then the outline. If it is not clearly there, search it (find_elements) instead of guessing a class.
- Hide the smallest element that holds exactly that part (the badge, not its row; the shelf, not the page column). Never hide html, body, the main content or a container that also holds it.
- Repeated parts (labels on every item, Shorts shelves, ads in a feed): use the repeated selector of the components or scope "all_similar"; hiding only the first one is a failure.
- Prefer display:none (no empty space). Use visibility:hidden only to keep a layout from jumping.
- Leftover space: when the hidden part was a column or a fixed-size slot, let the remaining content take the space (the main column flex:1 / max-width:none / width:auto) instead of leaving a hole.
- A hidden fixed or sticky bar often leaves a padding-top or margin-top reserved for it on body or main: remove it too.
- Inline labels and separators ("·", "|", "(…)") that only make sense with the hidden part go with it.
- If the part does not exist on this page, change nothing and say so.
