# Démo Browser Paint (CodeJam 2026)

Pitch de 5 à 10 min, en live sur notre laptop. Spécification : [`PRD.md`](PRD.md). Avancement : [`plan.md`](plan.md).

## Avant le pitch (checklist)

- [ ] `npm install && npm run build`. Dans `chrome://extensions`, activer le mode développeur, cliquer **Load unpacked** et choisir `dist/`. Épingler l'icône.
- [ ] **Options** : coller la clé, choisir le fournisseur, puis **Tester la connexion**. Le modèle doit être marqué « disponible ».
- [ ] Répéter **chaque prompt ci-dessous avec la vraie clé**, sur le Wi-Fi de la salle, et noter le temps de réponse.
- [ ] Ouvrir les onglets de démo à l'avance. Fenêtre maximisée, zoom à 100 %, panel ouvert.
- [ ] Repartir d'un état propre : panel → **Modifications** → supprimer les règles de répétition (ou **Tout exporter** avant, pour pouvoir les réimporter).
- [ ] Vidéo de secours enregistrée (voir plus bas).

## Sites de démo

Ces scénarios ont été vérifiés automatiquement sur les vrais sites (`node tests/e2e/demo-sites.ts`) : la distillation expose bien la région visée, les sélecteurs générés sont stables, et preview, Keep et reload rejouent la modif. Le test n'utilise pas de LLM : il applique la recette qu'un modèle devrait renvoyer. Il reste donc à répéter les prompts avec la vraie clé.

| Site                                                                   | Prompt à taper                                           | Résultat attendu                                | Région / sélecteur vérifié |
| ---------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------- | -------------------------- |
| [Wikipedia · Golden ratio](https://en.wikipedia.org/wiki/Golden_ratio) | « Cache la table des matières »                          | La colonne de gauche disparaît                  | `#mw-panel-toc`            |
| idem                                                                   | « Agrandis le texte de l'article et rends-le plus aéré » | Paragraphes plus grands (CSS libre `main p{…}`) | CSS libre                  |
| idem (picker)                                                          | 🎯 sur l'infobox, puis **Cacher cet élément**            | L'infobox disparaît, **sans IA**                | `table.infobox`            |
| [Hacker News](https://news.ycombinator.com/)                           | « Mode sombre », puis « un peu moins contrasté »         | Fond sombre, puis révision                      | `#hnmain`                  |
| [GitHub · TypeScript](https://github.com/microsoft/TypeScript)         | « Cache la colonne About à droite »                      | Le README prend la place                        | région « About »           |

## Script (environ 6 min)

1. **Le problème (45 s).** Chaque site impose sa mise en page. Les extensions de CSS perso existent déjà, mais elles demandent d'écrire du CSS et elles cassent.
2. **Premier prompt (1 min 30).** Sur Wikipedia, taper « Cache la table des matières ». La preview apparaît. Bascule **Original / Modifié** pour montrer l'avant/après, puis **Garder**.
3. **Ça se souvient, et instantanément (1 min).** Fermer le panel et recharger la page : la modif est là dès la première image, sans flash et sans appel à l'IA. Phrase clé : _« L'IA ne sert qu'une fois. Ensuite c'est du CSS précompilé, injecté avant le premier paint. »_
4. **Pointer au lieu de décrire (45 s).** 🎯 **Pointer un élément**, survoler l'infobox (↑ pour remonter au parent), cliquer, puis **Cacher cet élément**. C'est instantané et ça ne passe pas par l'IA.
5. **Itérer (1 min).** Sur Hacker News, taper « Mode sombre », puis « un peu moins contrasté ». La preview est révisée, pas recréée. **Garder**.
6. **Sécurité (45 s).** L'IA ne renvoie que des données (une recette JSON validée), jamais du code. `url()` et `@import` sont refusés, et les valeurs de formulaire ne sont jamais envoyées. Sur un site bancaire, la bannière 🔒 s'affiche et rien n'est envoyé.
7. **Fiabilité (30 s).** Onglet **Modifications** : toggles, **Vérifier** (health check), badge « cassée » si le site change, export JSON.

## Plan B

- **L'IA est lente ou en panne :** le picker (**Cacher cet élément**) marche sans IA. Pour le reste, montrer les règles déjà enregistrées (import d'un JSON préparé) et la vidéo.
- **Un prompt donne un mauvais résultat :** **Annuler**, puis reformuler en pointant l'élément d'abord. Une demande précise et ciblée marche beaucoup mieux qu'une demande vague.
- **« Rechargez l'onglet » :** l'onglet était ouvert avant l'installation. Le recharger.

## Vidéo de secours

L'enregistrer après la répétition, avec la vraie clé : QuickTime → _Nouvel enregistrement de l'écran_, fenêtre Chrome seule, en suivant le script ci-dessus. La garder en local, hors du dépôt.
