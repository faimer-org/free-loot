# Free Loot

Site statique qui liste les jeux et DLC **offerts temporairement** sur Steam et l'Epic Games Store, mis à jour deux fois par jour par une GitHub Action.

Site : https://faimer-org.github.io/free-loot/

## Offres suivies

| Type | Steam | Epic |
|---|---|---|
| Free to Keep (payant offert, conservé à vie) | ✔ | ✔ |
| Free Weekend (jouable gratuitement pendant un événement) | ✔ (non vérifié en conditions réelles) | — |
| Devenu gratuit, sans date de fin | ✔ (heuristique, voir plus bas) | ✘ non exposé par l'API |
| DLC, avec le jeu de base requis | ✔ | ✔ (nom du jeu de base déduit de son slug) |

Exclus : free-to-play permanents, démos, remises qui ne descendent pas à 0.

## Fonctionnement

```
GitHub Action (7 h 45 et 17 h 45, heure de Paris)
  └─ collector/main.ts
       ├─ Epic   freeGamesPromotions          → promotions gratuites en cours et à venir
       ├─ Steam  IStoreService/GetAppList     → apps modifiées depuis la dernière exécution (clé requise)
       │         IStoreBrowseService/GetItems → prix, remise, date de fin, type, DLC, jaquette (sans clé)
       │         appdetails                   → recoupement des Free to Keep
       ├─ fusion avec site/data/offers.json, archivage dans site/data/history/<année>.json
       └─ data/state.json                     → curseur Steam (non publié)
  └─ commit des données, puis publication de site/ sur GitHub Pages
```

- `site/data/offers.json` : offres en cours, à venir et expirées depuis moins de 30 jours.
- `site/data/history/<année>.json` : offres plus anciennes, chargées par la page seulement quand on affiche les expirées.
- `data/state.json` : dernière lecture de `GetAppList` et plus grand `price_change_number` vu.

## Développement

Prérequis : Node.js 24 (TypeScript exécuté directement, sans compilation).

```bash
npm install
npm test            # tests (node:test)
npm run typecheck   # vérification des types (tsc)
npm run collect:dry # collecte réelle, sans écrire de fichier
npm run collect     # collecte réelle, écrit site/data et data/state.json
npm run serve       # http://localhost:8080
```

### Clé Steam en local

```bash
cp .env.example .env.local
```

Puis renseigner `STEAM_API_KEY` dans `.env.local` (ignoré par git). Sans clé, la collecte Steam se limite à revérifier les offres déjà connues.

## Mise en place sur GitHub

1. Dépôt **public** (GitHub Pages n'est disponible que sur les dépôts publics du plan gratuit).
2. *Settings → Pages → Source* : **GitHub Actions**.
3. *Settings → Secrets and variables → Actions* : secret `STEAM_API_KEY`.
4. Lancer le workflow une première fois depuis l'onglet *Actions* (*Run workflow*).

La clé n'existe que dans l'environnement de l'étape de collecte : elle n'est écrite dans aucun fichier, et seul `site/` est publié.

## Points non vérifiés

- **Free Weekend** : détecté par le champ `free_weekend` de `GetItems` (présent dans le proto Steam), jamais observé en conditions réelles. On ne sait pas non plus si l'activation d'un Free Weekend fait apparaître l'app dans `GetAppList`.
- **Devenu gratuit** : repose sur l'hypothèse que `price_change_number` est un compteur global croissant. La collecte journalise sa plage de valeurs pour la vérifier.
- **Débit** : limites Steam non documentées ; environ 200 appels par 5 minutes pour `appdetails` selon la communauté.
- **Planification** : GitHub peut retarder une exécution planifiée, voire l'abandonner en cas de forte charge.

## Conventions

- Préfixe `localStorage` : `fl-` (origine partagée avec les autres sites de `faimer-org`).
- Chemins relatifs uniquement (site servi sous `/free-loot/`).
