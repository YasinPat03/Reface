# PRD : Browser Paint

Extension Chrome (Manifest V3) qui modifie n'importe quel site web à partir d'un prompt en langage naturel. Les modifications sont sauvegardées par site et rejouées instantanément, **sans appel LLM**, à chaque visite.

- **Contexte :** CodeJam 2026, 3 à 4 personnes, 24 à 36 h de build, pitch de 5 à 10 min en démo live sur notre laptop, sur de vrais sites.
- **Suivi d'avancement :** [`plan.md`](plan.md)

---

## 1. Décisions verrouillées

| Sujet        | Décision                                                                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base de code | Projet neuf en **TypeScript**. Le prototype précédent (Reskin) n'est pas réutilisé.                                                                                                                               |
| Build        | **Vite + `@crxjs/vite-plugin`**                                                                                                                                                                                   |
| UI           | **Side panel React + Tailwind** (le panel reste ouvert pendant la navigation, contrairement à un popup)                                                                                                           |
| Sortie IA    | **Recette JSON validée par Zod**, compilée en CSS par l'extension. Le LLM n'écrit jamais de code exécutable.                                                                                                      |
| LLM          | **BYOK** : API compatible OpenAI appelée directement depuis le service worker. La base URL, le modèle et la clé sont configurables (OpenAI, Groq, Gemini…). Pas de raisonnement, structured output `json_schema`. |
| Stockage     | `chrome.storage.local` + `unlimitedStorage`. Aucun backend.                                                                                                                                                       |
| Stratégie    | **MVP minimal fonctionnel d'abord.** Les features avancées sont ajoutées ensuite, une par une, selon ce qu'on veut démontrer.                                                                                     |

## 2. Périmètre MVP

| ID  | Exigence                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | L'utilisateur tape un prompt dans le side panel ; l'agent modifie la page courante.                                                         |
| M2  | Preview → **Keep** / **Discard**. Un prompt de suivi révise la preview.                                                                     |
| M3  | Les modifs gardées persistent par site (hostname) et se réappliquent automatiquement à chaque visite, avant le premier paint (pas de FOUC). |
| M4  | Liste des règles du site : on/off, suppression, prompt d'origine visible.                                                                   |
| M5  | « Pause sur ce site » et bascule **Original / Modifié** pour la démo.                                                                       |
| M6  | Element picker : pointer un élément pour cibler le prompt, ou le cacher en un clic sans LLM.                                                |
| M7  | Page Options : clé API, base URL, modèle, test de connexion.                                                                                |
| M8  | Export/Import JSON des règles.                                                                                                              |
| M9  | Health check basique : un sélecteur qui ne matche plus passe la règle en « suspecte » (badge rouge).                                        |

**Hors MVP (backlog, voir `plan.md`) :**

- raccourcis vers des pages enfouies (`insertLink`, record mode) ;
- classification de site ;
- préférences par catégorie et suggestions ;
- self-heal ;
- navigation SPA ;
- ops `move`/`resize` ;
- Gemini Nano ;
- crawl et macros.

**Non-objectifs :**

- JavaScript généré par l'IA ;
- sync entre appareils ;
- serveur ou base de données ;
- publication sur le Chrome Web Store.

## 3. Architecture

```
side panel (React) ──msg──► service worker (agent core) ──fetch──► LLM (BYOK)
      ▲                          │ écrit rules:<host> + css:<host>
      │                          ▼
content script B (document_idle)  chrome.storage.local
  distille le DOM, preview,        ▲ lecture directe
  picker, health check           injecteur (document_start, 0 dépendance)
```

- **Injecteur (`document_start`) :** lit `css:<host>` **directement** dans `chrome.storage.local` (il ne passe jamais par le service worker, ce qui évite le FOUC), puis ajoute `<style id="bp-styles">` sur `document.documentElement`. Il écoute `storage.onChanged` pour les mises à jour live. Son bundle doit rester minuscule.
- **Content script B (`document_idle`) :** distille le DOM, gère la preview (`<style id="bp-preview">`), le picker et le health check.
- **Service worker :** gère l'appel LLM, la validation, la génération des sélecteurs et l'écriture en stockage. Il ne garde aucun état en mémoire globale.

Structure visée :

```
src/injector/   src/content/   src/background/   src/shared/   src/panel/   src/options/
```

## 4. Modèles de données (MVP)

Clés de stockage : `rules:<host>`, `css:<host>` (CSS précompilé), `paused:<host>`, `settings`.

```jsonc
// rules:<host>
{
  "host": "www.youtube.com",
  "rules": [
    {
      "id": "r_7f3a",
      "kind": "restyle",
      "createdAt": "2026-11-21T10:22:00Z",
      "prompt": "cache les commentaires",
      "urlPattern": "https://www.youtube.com/*",
      "enabled": true,
      "ops": [{ "op": "hide", "target": "t1" }],
      "targets": {
        "t1": {
          "selectors": ["ytd-comments#comments", "#comments"],
          "fingerprint": {
            "tag": "ytd-comments",
            "id": "comments",
            "classes": [],
            "role": null,
            "textSample": "",
            "childCount": 3,
          },
          "minMatches": 1,
        },
      },
      "intent": null, // réservé pour le backlog (préférences)
      "health": { "lastOk": "…", "failures": 0, "status": "ok" },
    },
  ],
}
```

Réponse attendue du LLM (structured output) :

```jsonc
{
  // Un changement par chose demandée : « cache X, agrandis Y » = 2 changements = 2 règles.
  "changes": [
    {
      "title": "Cacher les commentaires",
      "ops": [{ "op": "hide|style|theme", "target": "t1", "css": { "display": "none" } }],
      "targets": { "t1": { "regionIndex": 12, "selectorHints": ["#comments"] } },
      "css": "", // échappatoire : CSS libre, soumis aux mêmes validations
    },
  ],
  "explanation": "Cache la section des commentaires.",
}
```

**C'est l'extension, pas le LLM, qui transforme `regionIndex` en sélecteurs robustes.** Ordre de préférence :

1. un id non généré ;
2. `data-testid`, `aria-label` ou `role` ;
3. une balise custom ;
4. des classes non hashées ;
5. un court chemin depuis un ancêtre stable.

On garde 2 ou 3 sélecteurs uniques.

## 5. Distillation du DOM

- Une ligne par région : landmarks, éléments custom et gros conteneurs. Format : `[#12] <aside id=secondary role=complementary class="…" rect=(x,y,w,h en fractions) kids=20 text="…">`.
- Plafond d'environ 150 régions, soit environ 2k tokens. Le texte est tronqué à 60 caractères.
- Si un élément a été pointé avec le picker, son sous-arbre et ses ancêtres sont inclus en entier.
- **Jamais** de valeurs de formulaire ni de champs cachés. Emails et longues suites de chiffres sont expurgés.

## 6. Sécurité et confidentialité (obligatoire dès le MVP)

1. **Données, pas de code :** toute sortie LLM passe d'abord par Zod, puis par une allow-list d'ops et de propriétés CSS.
2. **Validation CSS :** on rejette tout CSS qui contient l'un des éléments suivants. Cette logique vient du prototype précédent et doit être portée.
   ```ts
   /[\\\u0000]/                                                   // escapes, null
   /\/\*|\*\//                                                    // commentaires
   /@(?:import|namespace|font-face|property)\b/i
   /\b(?:url|image|image-set|cross-fade|paint|element|attr|expression)\s*\(/i
   /(?:https?|data|javascript|file|chrome-extension)\s*:/i
   /-moz-binding\s*:|behavior\s*:/i
   ```
   On fait aussi une taille max (environ 16 KB) et un parse via `new CSSStyleSheet().replaceSync()`, qui doit produire au moins une règle. Chaque déclaration est forcée en `!important`.
3. **Prompt injection :** le texte de la page est encadré par des délimiteurs et marqué comme donnée non fiable. L'agent n'a aucun outil : il ne peut que renvoyer une recette.
4. **Sites sensibles :** sur les banques, les emails, `chrome://` et les IP intranet, aucun DOM n'est envoyé. Le replay des règles existantes continue de fonctionner.
5. **Clé API :** stockée dans `chrome.storage.local` (jamais dans `sync`), jamais commitée, jamais dans le bundle. `.env*` est dans le `.gitignore`.
6. **Contrôle utilisateur :** chaque modif est prévisualisée, annulable, togglable et exportable.

## 7. Cibles de performance

| Chemin            | Cible                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Replay au revisit | Styles présents dès la première frame, **0 appel LLM**, moins de 50 ms de travail de l'extension |
| Première modif    | 2 à 5 s de bout en bout (à mesurer sur le réseau de la salle)                                    |
| Health check      | Environ 1,5 s après `document_idle`, sans jamais bloquer la page                                 |

## 8. Critères d'acceptation MVP

- Prompt → preview → Keep → fermeture du panel → hard reload : la modif est là dès la première frame, et l'onglet Network ne montre aucun appel LLM.
- Toggle, suppression et pause sont reflétés immédiatement, sans recharger la page.
- Une recette contenant `url(…)` ou `@import` est rejetée (tests unitaires Vitest sur `compile.ts` et `schema.ts`).
- Aucun DOM n'est envoyé sur un site de la deny-list.
- Clé invalide, quota, timeout ou JSON invalide : l'utilisateur voit un message clair, jamais un crash.
- La démo est rodée sur 2 ou 3 vrais sites, avec une vidéo de secours.

## 9. Risques principaux

| Risque                         | Mitigation                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------- |
| FOUC                           | Lecture directe du stockage au `document_start` ; tester avec le CPU ×4 throttle |
| Spécificité CSS du site        | `!important` et des sélecteurs plus spécifiques                                  |
| Le LLM vise le mauvais élément | Picker, preview obligatoire, schéma strict                                       |
| Sélecteurs cassés              | Plusieurs sélecteurs, fingerprint et badge rouge (self-heal en backlog)          |
| Pics de latence LLM            | Distillation compacte, timeout, retry, raisonnement désactivé                    |
