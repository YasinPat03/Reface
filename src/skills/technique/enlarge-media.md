---
name: enlarge-media
kind: technique
triggers: \b(?:bigger|larger|enlarge|smaller|shrink|resize|agrandi\w*|grossi\w*|plus gros\w*|plus grand\w*|plus petit\w*|r[ée]dui\w*|miniatures?|thumbnails?|vignettes?)\b
description: Resize images, thumbnails and videos without breaking their cards: constraints, container, aspect ratio.
---
- Start from the media inventory: current size and "size limited by" constraints. When a constraint is missing or the structure is unclear, inspect_regions on the card shows the layout (flex row, fixed widths, min/max-width, flex-basis).
- Resize the media CONTAINER and the media together (e.g. the thumbnail wrapper and its img): the container usually carries the width, the img only fills it (width:100%; height:auto or aspect-ratio).
- Override every listed constraint on those exact elements (max-width, min-width, flex:0 0 Npx, width), or the change is invisible.
- Keep the aspect ratio: aspect-ratio:16/9 for video thumbnails, height:auto for photos; object-fit:cover only when a fixed box is wanted.
- Horizontal cards (media beside text): a bigger media squeezes the text. Either keep the text at least ~240px wide (let the card grow, flex-wrap:wrap) or stack the media above the text (flex-direction:column on the card, media width:100%).
- "Bigger" means about 1.3-1.5x, never a size below the current one. Prefer px values over min()/clamp(): they replay the same after reload.
