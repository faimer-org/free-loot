# CLAUDE.md — free-loot

Les règles communes de l'organisation sont dans le `CLAUDE.md` de l'espace `faimer-org/workspace`. Ce fichier ne contient que ce qui est propre au projet.

## Projet

- Collecteur en TypeScript exécuté directement par Node 24 (`collector/`), sans dépendance à l'exécution. Syntaxe effaçable uniquement (`erasableSyntaxOnly`) : pas d'`enum`, pas de `namespace`, imports avec l'extension `.ts`.
- Page statique sans build (`site/`). `site/js/status.js` est partagé avec le collecteur : il reste en JavaScript (JSDoc), sans dépendance.
- Données publiées : `site/data/` (commitées par l'Action). État interne : `data/state.json`.
- Préfixe `localStorage` : `fl-`.

## Règles

- La clé Steam (`STEAM_API_KEY`) ne doit apparaître ni dans `site/`, ni dans `data/`, ni dans les journaux : ne jamais journaliser une URL de requête (`collector/http.ts` ne logue que des libellés).
- Seul `site/` est publié sur Pages.
- Tester la classification sur des réponses réelles enregistrées dans `tests/fixtures/` (dater le nom du fichier).
- Signaler toute hypothèse non vérifiée sur les API dans le README (section « Points non vérifiés »).

## Commandes

`npm test`, `npm run typecheck`, `npm run collect:dry`, `npm run serve`.
