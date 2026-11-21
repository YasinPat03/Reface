# CLAUDE.md : Browser Paint

Extension Chrome MV3 qui modifie n'importe quel site à partir d'un prompt. L'IA produit une recette JSON, compilée en CSS et rejouée au `document_start`.

## Au début de CHAQUE session, avant toute autre action

Lire ces trois fichiers en entier pour te mettre en contexte :

1. [`PRD.md`](PRD.md) : la spécification et les décisions verrouillées.
2. [`plan.md`](plan.md) : l'arbre des tâches, avec ce qui est fait et ce qui reste.
3. [`handoff.md`](handoff.md) : l'état actuel, les décisions d'architecture, les problèmes connus et les conventions de travail.

Vérifier ensuite l'état réel du dépôt : `git status -sb` et `git log --oneline -5`. Ces documents peuvent avoir un temps de retard sur le code.

## Rappels essentiels (détails dans handoff.md)

- Répondre et documenter **en français**.
- **Vérifier la branche courante avant de commiter.** Commiter et pusher à la fin de chaque phase ou correctif, avec la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Ne jamais commiter `Untitled`, `env.local`, `.env.local` ni `.live-shots/`. Ne jamais lire ni afficher la clé API.
- Avant de déclarer un travail terminé : `npm run lint && npm test && npm run test:e2e`. Si le comportement de l'IA a changé : `node tests/e2e/live.ts`.
- Mettre à jour `plan.md` (cases à cocher) et `handoff.md` quand l'état du projet change.
