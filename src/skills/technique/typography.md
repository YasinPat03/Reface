---
name: typography
kind: technique
triggers: \b(?:font|fonts|police|polices|typo\w*|text size|taille du texte|texte plus|lisib\w*|readab\w*|line height|interligne|letter spacing|espacement|serif|sans-serif|monospace)\b
description: Text size, fonts and readability: target the text itself, keep hierarchy, comfortable line length.
---
- Target the text elements (article paragraphs, list item titles, comment bodies), not the page container: headings, links and buttons usually set their own size and color, so they ignore a container value.
- Use the selectors of the components or the design snapshot for article text; "main p" or ".content p" only if they really exist here.
- Keep the hierarchy: titles stay larger than body text, metadata stays smaller (at least 12px).
- Comfortable reading: body 16-20px, line-height 1.5-1.7, line length about 60-80 characters (max-width:70ch on the text column).
- Fonts: system stacks only (system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; Georgia, "Times New Roman", serif; ui-monospace, SFMono-Regular, Menlo, monospace). No web fonts or url().
- Larger text inside fixed-height boxes (cards, rows) overflows: also set height:auto or min-height on that box.
- Letter and word spacing in small steps (0.01-0.05em; 0.1em for word spacing).
