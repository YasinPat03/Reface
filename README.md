# ReFace

Extension Chrome (Manifest V3) qui modifie n'importe quel site à partir d'un prompt. L'IA produit une **recette JSON validée**, compilée en CSS. Les modifications sont **rejouées instantanément à chaque visite**, avant le premier paint et sans appel à l'IA.

- Spécification : [`PRD.md`](PRD.md)
- Avancement : [`plan.md`](plan.md)
- Script de démo : [`DEMO.md`](DEMO.md)

## Démarrage rapide

### Prérequis

- **Node.js 22 ou plus** (`node --version`) et npm
- **Google Chrome 116 ou plus**
- Une **clé API** d'un fournisseur compatible OpenAI : OpenAI, Groq ou Gemini

### 1. Installer et construire l'extension

```bash
git clone https://github.com/YasinPat03/Reface.git
cd Reface
npm install
npm run build
```

`npm run build` crée le dossier `dist/`, l'extension prête à charger. Pour développer, `npm run dev` reconstruit `dist/` à chaque sauvegarde. Il faut quand même cliquer **↻** sur la carte de l'extension, puis recharger la page, pour voir les changements.

### 2. Charger l'extension dans Chrome

1. Ouvrir `chrome://extensions` et activer **Developer mode** (en haut à droite).
2. Cliquer **Load unpacked** et choisir le dossier **`dist/`** du projet. Sur macOS, dans la fenêtre de sélection, **Cmd + Shift + G** permet de coller le chemin.
3. Épingler l'extension : icône puzzle 🧩, puis épingle 📌 à côté de **Browser Paint**.
4. **Recharger les onglets déjà ouverts.** Une page ouverte avant l'installation ne contient pas l'extension, et le panel affiche « rechargez l'onglet ».

### 3. Configurer la clé API dans l'extension

1. Cliquer l'icône Browser Paint pour ouvrir le side panel, puis **Options** en haut à droite.
2. Choisir un fournisseur. Le bouton remplit l'URL et un modèle par défaut :

   | Fournisseur | URL de base                                               | Où obtenir une clé                            |
   | ----------- | --------------------------------------------------------- | --------------------------------------------- |
   | OpenAI      | `https://api.openai.com/v1`                               | platform.openai.com/api-keys (crédits requis) |
   | Groq        | `https://api.groq.com/openai/v1`                          | console.groq.com/keys (offre gratuite)        |
   | Gemini      | `https://generativelanguage.googleapis.com/v1beta/openai` | aistudio.google.com/apikey                    |

3. Coller la clé dans **Clé API** et, si besoin, changer le **Modèle**. Le modèle testé est `gpt-6-luna` chez OpenAI. Choisir un modèle rapide qui supporte les structured outputs (`json_schema`).
4. Cliquer **Enregistrer**, puis **Tester la connexion**. Le résultat attendu est « ✅ Connexion réussie » et « le modèle … est disponible ». Sinon, le champ **Modèle** propose la liste des modèles accessibles avec cette clé.

La clé est stockée uniquement dans `chrome.storage.local`, sur cet appareil. Elle n'est envoyée qu'au fournisseur choisi et n'est jamais commitée.

### 4. Lancer : première modification

1. Ouvrir par exemple https://en.wikipedia.org/wiki/Golden_ratio, puis le side panel.
2. Taper « Cache la table des matières » et cliquer **Prévisualiser**. La réponse arrive en 2 à 5 s.
3. Comparer avec **Original / Modifié**, puis cliquer **Garder**.
4. Fermer le panel et recharger la page : la modification revient immédiatement, sans appel à l'IA.

### 5. (Optionnel) Clé pour les tests « live »

Le test `tests/e2e/live.ts` pilote la vraie UI avec un vrai modèle. Il lit sa clé dans `.env.local`, à la racine, ignoré par git :

```bash
cp .env.example .env.local   # puis éditer .env.local avec la vraie clé
npx playwright install chromium   # une seule fois
npm run build && node tests/e2e/live.ts        # tous les scénarios
node tests/e2e/live.ts wiki                    # seulement ceux qui contiennent « wiki »
```

Ce fichier sert uniquement aux tests. L'extension, elle, utilise la clé saisie dans **Options**.

### Dépannage

| Symptôme                                                   | Solution                                                                                                                |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| « Rechargez l'onglet »                                     | Recharger la page (elle était ouverte avant l'installation ou la mise à jour).                                          |
| Le panel ne s'ouvre pas, ou l'ancien comportement persiste | `chrome://extensions`, puis **↻** sur Browser Paint, puis recharger la page.                                            |
| « Clé API refusée »                                        | Clé invalide, ou sans accès au modèle choisi.                                                                           |
| « Le fournisseur a refusé la requête : … »                 | Lire la raison affichée. Souvent, le modèle ne supporte pas les structured outputs : en choisir un autre.               |
| « Quota ou crédits API épuisés »                           | Ajouter des crédits chez le fournisseur, ou passer à Groq.                                                              |
| 🔒 « Site sensible »                                       | Normal : sur les banques, le courriel et l'intranet, rien n'est envoyé à l'IA. **Cacher cet élément** reste disponible. |

## Utiliser

Cliquer l'icône pour ouvrir le side panel :

- **Modifier :** décrire le changement, ou 🎯 pointer un élément d'abord. Cliquer **Prévisualiser**, affiner si besoin, puis **Garder**. **Cacher cet élément** cache l'élément pointé sans passer par l'IA.
- **Modifications :** activer ou désactiver chaque règle, la supprimer, **Vérifier** qu'elle trouve encore ses éléments, ouvrir le **Catalogue**.
- **Catalogue :** enregistrer les modifications de la page dans **Privée**, ajouter un thème de **Publique** à sa collection, puis l’appliquer sur sa page cible. Publier un thème privé avec un titre et une petite description.
- **Original / Modifié :** comparer avec la page d'origine. **Pause sur ce site :** tout désactiver sur ce site.

Sur les sites sensibles (banques, courriel, intranet…), aucun contenu n'est envoyé à l'IA. Les règles existantes continuent de s'appliquer.

## Architecture

| Fichier                      | Rôle                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/injector/index.iife.ts` | `document_start`, environ 1,2 KB. Lit `css:<host>` directement dans le stockage et injecte un `<style>`. C'est le seul code sur le chemin du rejeu. |
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

Avant le premier `test:e2e`, installer Chromium avec `npx playwright install chromium`. Le test live (`node tests/e2e/live.ts`) demande en plus une clé dans `.env.local` (voir l'étape 5 de « Démarrage rapide »).

**Debug :** `chrome-extension://<id>/src/panel/index.html?tabId=<id>` ouvre le panel dans un onglet, en visant un autre onglet.

## Catalogue public de démonstration

Dans un terminal séparé, démarrer `npm run catalogue` (Node 22.6 ou plus récent). Le service écoute seulement sur `127.0.0.1:8892` et lit les thèmes dans `demo/catalogue/public/`. Chaque publication crée un nouveau fichier JSON dans ce dossier. Des thèmes de démonstration sont inclus. Modifier ou ajouter des fichiers respectant `reface/catalogue/v1`, puis cliquer **Actualiser** pour les voir.

Ce catalogue « public » est une démonstration locale, accessible à l’extension sur cet ordinateur. Les collections privées restent dans `chrome.storage.local`. Ajouter un thème public à la collection ne l’active pas : **Appliquer** le charge uniquement sur son origine et son chemin de page. Les thèmes conservent leurs styles, pas les prompts originaux ni les extraits de texte capturés par le sélecteur. Aucun appel à un modèle n’est nécessaire.

Les anciennes règles restent actives à l’échelle du site. Les thèmes du Catalogue sont enregistrés séparément et leur CSS est compilé par page. L’injecteur suit aussi les changements de chemin des applications à navigation interne.
