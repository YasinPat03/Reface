---
name: stackoverflow
kind: site
hosts: stackoverflow.com stackexchange.com superuser.com serverfault.com askubuntu.com mathoverflow.net
description: Stack Overflow / Stack Exchange (Stacks design system): top bar, sidebars, question, answers, votes.
verify: https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array
---

Stack Overflow and every Stack Exchange site use the Stacks design system: ids and classes are stable (s-topbar, s-prose, js-* hooks), without hashed class names.

Layout: fixed top bar header.s-topbar, left navigation #left-sidebar (nav[aria-label="Primary"]: Questions, Tags, Users…), then #content with the main column #mainbar (role=main) and the right column #sidebar (boxes .s-sidebarwidget such as "The Overflow Blog", ads #dfp-tsb / #dfp-msb, "Linked" #h-linked and "Related" #h-related lists, "Hot Network Questions" #hot-network-questions). Footer: footer#footer.

Question page: #question-header (title h1), #question (the question), #answers (#answers-header with the sort menu, then one .answer per answer, .accepted-answer for the accepted one). Each post is a .post-layout grid: vote column .js-voting-container (score .js-vote-count), content .postcell / .answercell with the body .s-prose (code blocks pre, .s-code-block), tags .post-tag, author card .post-signature, comments .comments (.comment rows).

Overlays: cookie banner #onetrust-banner-sdk (in #onetrust-consent-sdk); sign-up dialogs .s-modal, #signup-modal-container.

Width: #mainbar has a fixed width; to widen the reading column override max-width/width on #content and #mainbar, or hide #sidebar.

Custom dark theme: repaint body, header.s-topbar, #content, .s-sidebarwidget, pre/code blocks and .post-tag. Stacks also has a native dark mode (body.theme-dark).

Never hide #content or #mainbar: they hold the question and answers.

```components
Top bar | top bar, header, en-tête, barre du haut, bandeau | header.s-topbar | one
Left navigation | left sidebar, menu, navigation, menu de gauche, barre latérale gauche | #left-sidebar | one
Right sidebar | right sidebar, sidebar, right column, colonne de droite, widgets | #sidebar | one
Hot network questions | hot network questions, hot questions, questions populaires | #hot-network-questions | one
Ads | ads, ad, pubs, publicités, sponsored | #dfp-tsb, #dfp-msb, #dfp-bsb | all
Question title | title, titre, question title, titre de la question | #question-header h1 | one
Question | question, the question | #question | one
Answers | answers, réponses | .answer | all
Accepted answer | accepted answer, réponse acceptée | .accepted-answer | one
Vote column | votes, score, vote buttons, boutons de vote | .js-voting-container | all
Post text | text, texte, body, post text | .s-prose | all
Code blocks | code, code blocks, blocs de code | .s-prose pre | all
Tags | tags, étiquettes, mots-clés | .post-tag | all
Comments | comments, commentaires | .comments | all
Cookie banner | cookies, cookie banner, consent, bannière cookies, consentement | #onetrust-banner-sdk | one
Footer | footer, pied de page | footer#footer | one
```
