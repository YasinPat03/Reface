# Browser Paint

Extension Chrome (Manifest V3) qui modifie n'importe quel site à partir d'un prompt. L'IA produit une **recette JSON validée**, compilée en CSS. Les modifications sont **rejouées instantanément à chaque visite**, avant le premier paint et sans appel à l'IA.

- Spécification : [`PRD.md`](PRD.md)
- Avancement : [`plan.md`](plan.md)
- Script de démo : [`DEMO.md`](DEMO.md)

## Installer

```bash
npm install
npm run build        # ou `npm run dev` pour le rechargement à chaud
```

Dans `chrome://extensions`, activer le **mode développeur**, cliquer **Load unpacked** et choisir `dist/`. Ouvrir ensuite **Options** pour ajouter une clé API d'un fournisseur compatible OpenAI (OpenAI, Groq, Gemini…). La clé reste dans `chrome.storage.local`.

## Utiliser

Cliquer l'icône pour ouvrir le side panel :

- **Modifier :** décrire le changement, ou 🎯 pointer un élément d'abord. Cliquer **Prévisualiser**, affiner si besoin, puis **Garder**. **Cacher cet élément** cache l'élément pointé sans passer par l'IA.
- **Modifications :** activer ou désactiver chaque règle, la supprimer, **Vérifier** qu'elle trouve encore ses éléments, exporter ou importer en JSON.
- **Original / Modifié :** comparer avec la page d'origine. **Pause sur ce site :** tout désactiver sur ce site.

Sur les sites sensibles (banques, courriel, intranet…), aucun contenu n'est envoyé à l'IA. Les règles existantes continuent de s'appliquer.

## Architecture

| Fichier                      | Rôle                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/injector/index.iife.ts` | `document_start`, moins de 1 KB. Lit `css:<host>` directement dans le stockage et injecte un `<style>`. C'est le seul code sur le chemin du rejeu. |
| `src/content/`               | Script de contenu (`document_idle`) : distillation du DOM, sélecteurs robustes, preview, picker, health check.                                     |
| `src/background/`            | Service worker : appel au LLM (structured outputs, timeout, retry) et boucle agent.                                                                |
| `src/shared/`                | Types, schéma Zod de la recette, compilateur CSS, garde-fous CSS, stockage, messagerie typée, liste des sites sensibles.                           |
| `src/panel/`, `src/options/` | Interfaces React + Tailwind.                                                                                                                       |

## Tests

```bash
npm run lint && npm run typecheck
npm test               # unitaires (Vitest)
npm run test:e2e       # build + Playwright/Chromium avec l'extension chargée et un faux LLM
node tests/e2e/demo-sites.ts      # contrôle des sites de démo réels (réseau)
node tests/e2e/distill-real.ts    # taille et durée de la distillation sur de vraies pages
```

Avant le premier `test:e2e`, installer Chromium avec `npx playwright install chromium`.

**Debug :** `chrome-extension://<id>/src/panel/index.html?tabId=<id>` ouvre le panel dans un onglet, en visant un autre onglet.
