---
name: github
kind: site
hosts: github.com
description: GitHub repository pages: React/Primer hashed classes, data-testid hooks, header actions, About column.
verify: https://github.com/microsoft/TypeScript
---

GitHub pages are rendered by React with Primer components: most class names are hashed (prc-…, sectionHeading__4n11uG, Box-sc-…) and change at every deploy. Never use them: use data-testid attributes, aria-labels, stable ids and semantic tags.

Global header: header[aria-label="Global navigation menu"] (logo a[aria-label="Homepage"], search, sign in/up).

Repository header: owner/name [data-testid="repo-name-wrapper"] (link a[data-testid="repo-name-link"]), visibility label, then the actions list ul[data-testid="repo-header-actions"] with Notifications, Fork [data-testid="fork-button"] and Star [data-testid="star-button"]. Repository tabs: nav[aria-label="Repository"] (Code, Issues, Pull requests, Actions…).

Code tab: branch picker, "Go to file", the latest commit bar [data-testid="latest-commit"], the file table table[aria-labelledby="folders-and-files"] (one tr.react-directory-row per entry), then the README rendered as article.markdown-body (its tabs README/License in nav[aria-label="Repository files"]).

Right column "About": description, website, topics (links a[href*="/topics/"]), Readme/License links, stars/watchers/forks, then Releases, Packages, Contributors and Languages (bar segments span[aria-label$="%"]). Its containers have hashed classes: target the parts listed in the components, or the "About" column region from the outline.

Width: the repository layout is centered in .container-xl.

Custom dark theme: repaint body, the global header, .markdown-body, the file table and borders. GitHub also has native themes (html[data-color-mode]).

The URL section is the owner (/microsoft/…): a rule made on one repository applies to that owner's repositories by default.

Footer: footer.footer (nav[aria-label="Footer"]).

```components
Global header | header, top bar, en-tête, barre du haut, navigation | header[aria-label="Global navigation menu"] | one
Repository name | repo name, repository name, nom du dépôt, titre du dépôt | [data-testid="repo-name-wrapper"] | one
Header actions | actions, buttons, boutons, header buttons | ul[data-testid="repo-header-actions"] | one
Star button | star, stars, étoile, étoiles, favori, bouton star | [data-testid="star-button"] | one
Fork button | fork, forks, bouton fork | [data-testid="fork-button"] | one
Notifications button | notifications, watch, suivre | [data-testid="notifications-sign-in-button"] ; [data-testid="notifications-subscriptions-menu-button"] | one
Repository tabs | tabs, onglets, issues, pull requests, actions tab | nav[aria-label="Repository"] | one
Latest commit bar | commit, latest commit, dernier commit, commit bar | [data-testid="latest-commit"] | one
File list | files, fichiers, file list, liste des fichiers, folders, dossiers | table[aria-labelledby="folders-and-files"] | one
File rows | file rows, rows, lignes | tr.react-directory-row | all
README | readme, lisez-moi, documentation | article.markdown-body | one
Topics | topics, topic, tags, sujets, étiquettes, mots-clés | a[href*="/topics/"] | all
Languages bar | languages, langages, language bar, langues | span[aria-label$="%"] | all
Footer | footer, pied de page | footer.footer | one
```
