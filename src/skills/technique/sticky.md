---
name: sticky
kind: technique
triggers: \b(?:sticky|fixed|fixe[sd]?|collant\w*|always visible|toujours visible|reste en haut|stays? on top|floating|flottant\w*|banner|bubble|bulle|popup|pop-up|overlay)\b
description: Sticky and fixed elements: make a bar stick or stop sticking, remove floating widgets and overlays.
---
- Make something stick: position:sticky; top:0 (or the height of a bar above it); z-index above the content; an opaque background. Sticky fails when an ancestor has overflow:hidden/auto or when the element is the only child of a short parent: stick the outer bar instead (inspect_regions shows parents).
- Stop a bar from following the scroll: position:static (or relative) on that bar, then remove the space the page reserved for it (padding-top / margin-top on body, main or the page wrapper, often equal to the bar height).
- Floating widgets (chat bubbles, "back to top", cookie or newsletter banners, app prompts) are position:fixed: find them by their text or aria-label (find_elements) and hide that element, never its whole container if it holds page content.
- Overlays that block the page (modal backdrops) usually come with overflow:hidden on html or body: restore overflow:auto there when hiding them.
- Do not change position on items of virtualized lists (X timelines, long feeds): they are positioned by the site script.
