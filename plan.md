# Plan d'avancement : Browser Paint

> Spécification : [`PRD.md`](PRD.md). Cocher les cases au fur et à mesure.

## Arbre d'avancement

### Phase 0 : Squelette (h 0 → 2, tout le monde)

- [x] **0.1 Init projet**
  - [x] Monorepo simple : `npm create vite` (React + TS), puis ajout de `@crxjs/vite-plugin`, Tailwind et Zod
  - [x] ESLint + Prettier, `.gitignore` (dont `.env*`)
  - [x] Script `npm run dev` qui recharge l'extension à chaud
- [x] **0.2 Manifest MV3**
  - [x] Permissions : `storage`, `unlimitedStorage`, `sidePanel`, `scripting`, `activeTab`
  - [x] `host_permissions` : `<all_urls>` (plus l'hôte de l'API LLM)
  - [x] Content scripts : l'injecteur à `document_start` et le script B à `document_idle`
  - [x] Ouvrir le side panel au clic sur l'icône (`sidePanel.setPanelBehavior`)
- [x] **0.3 Contrats partagés** (`src/shared/`)
  - [x] Types `Rule`, `Recipe`, `Op` et `SiteRules`, d'après PRD §4
  - [x] Clés de stockage `rules:<host>`, `css:<host>`, `settings`, `paused:<host>`
  - [x] Union typée des messages panel ↔ SW ↔ content
- [ ] **0.4 Hello world de bout en bout** : un bouton du panel déclenche un ping vers le SW, qui le relaie au content, qui le renvoie au panel

### Phase 1 : Replay rapide (Personne A)

- [ ] **1.1 Injecteur `document_start`**
  - [ ] `chrome.storage.local.get("css:"+host)` est lu directement, sans passer par le SW
  - [ ] Ajoute `<style id="bp-styles">` sur `document.documentElement`
  - [ ] Respecte `paused:<host>`
  - [ ] Bundle < 2 KB, sans aucune dépendance
- [ ] **1.2 Mise à jour live** : `storage.onChanged` remplace le `<style>` sans recharger la page
- [ ] **1.3 Compilateur** (`shared/compile.ts`)
  - [ ] Recette → chaîne CSS avec `!important`
  - [ ] Recompile `css:<host>` à partir de toutes les règles `enabled`
- [ ] **1.4 Vérification FOUC** : hard reload avec CPU ×4 throttle, aucun flash visible

### Phase 2 : Boucle agent (Personne B)

- [ ] **2.1 Distillation DOM** (`content/distill.ts`)
  - [ ] Régions : landmarks, éléments custom et gros conteneurs, avec index, tag, id, classes stables, rect et un échantillon de 60 caractères de texte
  - [ ] Plafond d'environ 150 régions, pas de valeurs de formulaire, emails et chiffres expurgés
- [ ] **2.2 Schéma de recette** (`shared/schema.ts`)
  - [ ] Ops MVP : `hide`, `style`, `theme`, plus un champ `css` libre en échappatoire
  - [ ] `targets` : `regionIndex` + `selectorHints`
  - [ ] Champ `explanation` (on prévoit aussi `intent` optionnel pour plus tard)
- [ ] **2.3 Validation et sécurité**
  - [ ] Zod, puis une allow-list de propriétés CSS
  - [ ] Rejet de `url()`, `@import`, `attr()`, `expression`, `javascript:` (regex dans PRD §6)
  - [ ] Parse via `CSSStyleSheet`
- [ ] **2.4 Appel LLM** (`background/llm.ts`)
  - [ ] Client compatible OpenAI (base URL + modèle + clé lus depuis `settings`)
  - [ ] Structured output (`json_schema`), raisonnement désactivé, timeout de 15 s et un retry
  - [ ] Le texte de la page est encadré comme donnée non fiable
- [ ] **2.5 Sélecteurs** : l'extension transforme `regionIndex` en 2 ou 3 sélecteurs stables (id non généré, `data-testid`/aria/role, classes non hashées)
- [ ] **2.6 Preview / Keep / Discard**
  - [ ] La preview est injectée dans un `<style id="bp-preview">` séparé
  - [ ] Keep écrit `rules:<host>`, recompile `css:<host>` et enregistre les fingerprints
  - [ ] Discard retire la preview
- [ ] **2.7 Itération** : un prompt de suivi révise la preview en cours

### Phase 3 : Side panel et gestion (Personne C)

- [ ] **3.1 Page Options** : clé API, base URL, modèle, bouton « Tester la connexion »
- [ ] **3.2 Onglet Chat** : prompt, état « génération… », explication, boutons Preview/Keep/Discard
- [ ] **3.3 Liste des règles du site** : toggle on/off, supprimer, voir le prompt d'origine
- [ ] **3.4 Contrôles globaux** : interrupteur « Pause sur ce site » et bascule « Original / Modifié » pour la démo
- [ ] **3.5 Export/Import JSON** des règles

### Phase 4 : Element picker (Personne C, après la phase 3)

- [ ] **4.1 Mode « pointer un élément »** : surbrillance au survol, la sélection se fait au clic, Échap annule
- [ ] **4.2 Contexte prioritaire** : le sous-arbre et les ancêtres de l'élément choisi sont envoyés en entier dans la distillation
- [ ] **4.3 Ops rapides sans LLM** : « Cacher cet élément » en un clic

### Phase 5 : Durcissement MVP et démo (tout le monde)

- [ ] **5.1 Deny-list des sites sensibles** (banques, email, `chrome://`, IP intranet) : aucun DOM n'est envoyé, le replay continue de fonctionner
- [ ] **5.2 Health check basique** : un sélecteur qui ne matche plus marque la règle « suspecte » avec un badge rouge
- [ ] **5.3 Gestion des erreurs** : clé invalide, quota, timeout et JSON invalide donnent chacun un message clair
- [ ] **5.4 Choix de 2 ou 3 sites de démo** et test des prompts répétés
- [ ] **5.5 Script de démo** : prompt → preview → Keep → panel fermé → reload, la modif revient, puis Original/Modifié
- [ ] **5.6 Vidéo de secours** de la démo

> **Jalon MVP** : les phases 0 à 5 sont cochées. La démo de base marche de bout en bout.

---

### Backlog : features avancées à ajouter une par une (par priorité démo)

On choisit au fur et à mesure. Chacune s'appuie sur le MVP sans le casser.

- [ ] **A. Raccourcis vers pages enfouies** (F7/F8)
  - [ ] Op `insertLink` + allow-list de liens (https, même domaine enregistrable, `textContent` seulement)
  - [ ] Inventaire des liens dans la distillation, pour pouvoir promouvoir un lien caché
  - [ ] Record mode via `webNavigation`, avec les boutons « Démarrer » et « C'est cette page »
  - [ ] Style `match_siblings`, et un MutationObserver qui réinsère le bouton (au plus quelques fois)
- [ ] **B. Classification de site** (F4) : table de domaines → `og:type`/JSON-LD → petit appel LLM, avec un cache de 30 jours
- [ ] **C. Préférences par catégorie** (F5/F6)
  - [ ] Vocabulaire d'intents fixe et champ `intent` dans la recette
  - [ ] Fusion ADD/UPDATE/NOOP et calcul de la confiance
  - [ ] Carte de suggestion à la première visite, avec Preview/Apply/Pas ici/Jamais
- [ ] **D. Self-heal** (F11) : re-match local par fingerprint, et réparation par le LLM seulement en dernier recours
- [ ] **E. Navigation SPA** : `onHistoryStateUpdated` relance les ops DOM et le health check
- [ ] **F. Ops DOM `move`/`resize`** (ce que le CSS ne sait pas faire)
- [ ] **G. Gemini Nano** pour la classification sur l'appareil
- [ ] **H. Crawl agent / macro click-path** (F9/F10)

---

## Répartition suggérée (3 à 4 personnes)

- **A :** phase 1, puis 5.1 et 5.2
- **B :** phase 2
- **C :** phases 3 et 4
- **D (si présent) :** page Options, sécurité 2.3 et gestion des erreurs 5.3, puis la première feature du backlog

## Vérification

- `npm run build`, puis chargement de `dist/` dans `chrome://extensions` (mode développeur)
- **Replay :** créer une règle, fermer le panel, faire un hard reload. Le style est présent dès la première frame, et la Performance tab ne montre aucun appel LLM
- **Toggle, suppression, pause :** chaque action est reflétée immédiatement via `storage.onChanged`
- **Sécurité :** une recette contenant `url(...)` ou `@import` est rejetée (test unitaire Vitest sur `compile.ts` et `schema.ts`), et aucun DOM n'est envoyé sur un site de la deny-list
- **Latence :** une première modif prend entre 2 et 5 s sur le réseau de la salle (à mesurer)
