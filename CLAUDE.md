# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Browser Paint (nom produit : ReFace)

Extension Chrome MV3 qui modifie n'importe quel site à partir d'un prompt. L'IA produit une recette JSON, compilée en CSS et rejouée au `document_start`. « Browser Paint » (docs, dépôt) et « ReFace » (manifest, UI) désignent le même projet.

## Au début de CHAQUE session, avant toute autre action

Lire ces trois fichiers en entier pour te mettre en contexte :

1. [`PRD.md`](PRD.md) : la spécification et les décisions verrouillées.
2. [`plan.md`](plan.md) : l'arbre des tâches, avec ce qui est fait et ce qui reste.
3. [`handoff.md`](handoff.md) : l'état actuel, les décisions d'architecture (§2, à respecter), les problèmes connus et les conventions de travail.

Vérifier ensuite l'état réel du dépôt : `git status -sb` et `git log --oneline -5`. Ces documents peuvent avoir un temps de retard sur le code (par exemple, le Catalogue et l'accessibilité ne sont pas encore dans la carte du code de `handoff.md`).

## Rappels essentiels (détails dans handoff.md)

- Répondre et documenter **en français**. Le prompt système du LLM reste en anglais.
- **Vérifier la branche courante avant de commiter.** Commiter et pusher à la fin de chaque phase ou correctif, avec la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Fusion vers `main` uniquement à la demande de l'utilisateur.
- Ne jamais commiter `Untitled`, `env.local`, `.env.local` ni `.live-shots/`. Ne jamais lire ni afficher la clé API (seulement vérifier la présence du fichier).
- Avant de déclarer un travail terminé : `npm run lint && npm test && npm run test:e2e`. Si le comportement de l'IA a changé : `node tests/e2e/live.ts`.
- Mettre à jour `plan.md` (cases à cocher) et `handoff.md` quand l'état du projet change.

## Commandes

```bash
npm run build          # typecheck (src + tests) puis vite build → dist/ (Load unpacked dans chrome://extensions)
npm run dev            # rebuild de dist/ à chaque sauvegarde (↻ sur l'extension + recharger la page)
npm run lint           # ESLint
npm run typecheck      # tsc sur src/ et sur tests/ (tests/tsconfig.json)
npm test               # Vitest, tests unitaires dans tests/*.test.ts
npm run test:e2e       # build + chaque tests/e2e/phase*.e2e.ts (Playwright/Chromium, faux LLM)
npm run catalogue      # serveur du catalogue public de démo, 127.0.0.1:8892, lit demo/catalogue/public/
```

Lancer un seul test :

```bash
npx vitest run tests/compile.test.ts            # un fichier unitaire
npx vitest run tests/compile.test.ts -t "nom"   # un cas précis
npm run build && node tests/e2e/phase3.e2e.ts   # une seule phase E2E (dist/ doit être à jour)
HEADED=1 node tests/e2e/phase3.e2e.ts           # E2E avec fenêtre visible
node tests/e2e/live.ts wiki                     # scénarios live (vrai LLM) contenant « wiki »
```

Les E2E chargent `dist/` via `tests/e2e/harness.ts` : toujours rebuilder avant. Le panel s'ouvre dans un onglet avec `chrome-extension://<id>/src/panel/index.html?tabId=<id>` (debug et E2E).

## Architecture d'ensemble

Flux d'une modification :

1. **Panel** (`src/panel/`, React) envoie un message typé au service worker (contrat `BgApi`/`ContentApi` dans `src/shared/messages.ts` : ajouter une entrée au contrat, puis un handler).
2. **Service worker** (`src/background/agent.ts`) demande au **content script** (`src/content/`, `document_idle`) le plan distillé de la page (`distill.ts`, `context.ts`), refusé sur les sites sensibles (`src/shared/sensitive.ts`).
3. `llm.ts` appelle une API compatible OpenAI (BYOK) en structured outputs avec le schéma « fil » strict (`src/shared/schema.ts`, aucun objet ouvert). Le LLM renvoie des `regionIndex`, **jamais de sélecteurs** : c'est `src/content/selectors.ts` qui les construit.
4. La recette (Zod, `src/shared/ruleSchema.ts`) est compilée en CSS (`src/shared/compile.ts`, filtré par `cssSafety.ts`) puis prévisualisée (`preview.ts`, vérifiée par `layoutCheck.ts`).
5. **Garder** écrit `rules:<host>` et `css:<host>` ensemble (`saveSiteRules`). Au chargement suivant, **l'injecteur** (`src/injector/index.iife.ts`, `document_start`) lit directement `chrome.storage.local` et injecte un `<style>`, sans service worker ni IA.

Contraintes transverses :

- L'injecteur est le seul code sur le chemin du rejeu : zéro dépendance, bundle < 2 KB. Il lit aussi les clés `reface-accessibility:v1:*` et les CSS par page du Catalogue.
- Les deux content scripts sont en `*.iife.ts` (le chargeur async de CRXJS retarde `document_start`).
- `css:<host>` est un objet par section (`{"*": …, "watch": …}`, `src/shared/section.ts`) ; l'injecteur suit les navigations SPA.
- Ne jamais assouplir `cssSafety.ts` ni la liste des sites sensibles.
- Modules isolés à l'interface minimale avec `App.tsx` : raccourcis (`src/shared/shortcuts.ts`, `src/panel/shortcuts/`, commandes ⌘⇧E/⌘⇧X dans `background/shortcutHotkey.ts`), Catalogue (`src/shared/catalogue*.ts`, `src/panel/Catalogue.tsx`, `scripts/catalogue-server.ts`, format `reface/catalogue/v1`), accessibilité (`src/shared/accessibility.ts`, `src/background/accessibility.ts`, `src/options/AccessibilitySettings.tsx`).
- Stack figée : TypeScript **5.9** (pas 7, incompatible avec `typescript-eslint`), Vite 8 + `@crxjs/vite-plugin` 3, React 19, Tailwind 4, Zod 4. Le manifest est dans `manifest.config.ts`.
