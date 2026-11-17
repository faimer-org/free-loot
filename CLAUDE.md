# CLAUDE.md — free-loot

Les règles communes de l'organisation sont dans le `CLAUDE.md` de l'espace `faimer-org/workspace`. Ce fichier contient ce qui est propre au projet, y compris sa documentation technique : le README s'adresse aux visiteurs du site.

## Projet

- Collecteur en TypeScript exécuté directement par Node 24 (`collector/`), sans dépendance à l'exécution. Syntaxe effaçable uniquement (`erasableSyntaxOnly`) : pas d'`enum`, pas de `namespace`, imports avec l'extension `.ts`.
- Page statique sans build (`site/`). `site/js/status.js` est partagé avec le collecteur : il reste en JavaScript (JSDoc), sans dépendance.
- Trois pages :
  - `index.html` (`js/app.js`) : offres en cours et à venir ; un jeu devenu gratuit n'y reste que 7 jours après sa détection (`NOW_FREE_HOME_DAYS`).
  - `devenus-gratuits.html` (`js/nowFree.js`) : jeux devenus gratuits encore gratuits, datés par leur détection (`firstSeen`).
  - `archives.html` (`js/archives.js`) : offres terminées, datées par leur fin ; seul chiffre affiché : la valeur des jeux à garder.
- `js/catalog.js` : liste commune aux Devenus gratuits et aux Archives (recherche, filtres, catégories, période, tri, pagination, état des filtres dans l'adresse), configurée par chaque page. Résultats regroupés par mois quel que soit le tri (le tri s'applique dans chaque mois). Périodes communes, en mois calendaires (paramètre `periode`) : `3m` (défaut : mois en cours et les deux précédents), `6m`, `annee`, `annee-derniere`, `tout`. Autres partagés : `js/common.js` (cartes, formats), `js/sortMenu.js` (menus déroulants), `js/preview.js` (aperçu au survol), `icons.svg` (logos et icônes, référencés par `<use href="icons.svg#…">`). Icône d'onglet : `favicon.svg`, avec `favicon-32.png` en secours, déclarée dans le `<head>` de chaque page.
- Données publiées : `site/data/` (commitées par l'Action). État interne : `data/state.json`.
- Préfixe `localStorage` : `fl-`.
- Mesure d'audience : Cloudflare Web Analytics, site `faimer-org.github.io` commun aux sites de l'organisation. Snippet `beacon.min.js` avant `</body>` de chaque page (à ajouter dans toute nouvelle page). Token public par conception, pas un secret ; pas de cookie. Tableau de bord Cloudflare (*Web Analytics*) filtré par chemin `/free-loot/` ; chiffres sous-estimés à cause des bloqueurs de publicité.

## Règles

- La clé Steam (`STEAM_API_KEY`) ne doit apparaître ni dans `site/`, ni dans `data/`, ni dans les journaux : ne jamais journaliser une URL de requête (`collector/http.ts` ne logue que des libellés).
- Seul `site/` est publié sur Pages.
- Tester la classification sur des réponses réelles enregistrées dans `tests/fixtures/` (dater le nom du fichier).
- Signaler toute hypothèse non vérifiée sur les API dans la section « Points non vérifiés » ci-dessous.
- L'Action commite sur `main` deux fois par jour : toujours partir d'un `main` à jour.
- Le README reste non technique : ce que fait le site, pour qui le visite.

## Offres suivies

| Type | Steam | Epic |
|---|---|---|
| Free to Keep (payant offert, conservé à vie) | ✔ | ✔ |
| Free Weekend (jouable gratuitement pendant un événement) | ✔ | — |
| Devenu gratuit, sans date de fin | ✔ (heuristique, voir plus bas) | ✘ non exposé par l'API |
| DLC, avec le jeu de base requis | ✔ | ✔ (nom du jeu de base déduit de son slug) |

Exclus : free-to-play permanents, démos, remises qui ne descendent pas à 0.

## Fonctionnement

```
Worker Cloudflare cron/ (7 h 45 et 17 h 45, heure de Paris)
  └─ workflow_dispatch → GitHub Action (update.yml)
  └─ collector/main.ts
       ├─ Epic   freeGamesPromotions          → promotions gratuites en cours et à venir
       ├─ Steam  IStoreService/GetAppList     → apps modifiées depuis la dernière exécution (clé requise)
       │         IStoreBrowseService/GetItems → prix, remise, date de fin, type, DLC, jaquette (sans clé)
       │         appdetails                   → recoupement des Free to Keep
       ├─ Détails (collector/steam/details.ts, sans clé)
       │         IStoreService/GetTagList     → noms des tags en français
       │         IStoreBrowseService/GetItems → tags, description, captures, micro-bande-annonce des offres Steam
       │         storesearch                  → jeu Steam du même nom qu'une offre Epic, pour ses tags
       ├─ fusion avec site/data/offers.json, archivage dans site/data/history/<année>.json
       └─ data/state.json                     → curseur Steam (non publié)
  └─ commit des données, puis publication de site/ sur GitHub Pages
```

- `site/data/offers.json` : offres en cours, à venir et expirées depuis moins de 30 jours. Un jeu devenu gratuit n'a pas de date de fin : il y reste tant qu'il est gratuit (le fichier grossit avec eux ; à sortir dans un fichier à part si le volume le justifie).
- Devenu gratuit : détecté une première fois quand son prix change (`priceChangedSinceLastRun`), il reste ensuite détecté tant qu'il est gratuit (`isKnownNowFree`, à partir des offres en cours d'`offers.json`). Redevenu payant, il n'est plus détecté et la fusion le clôt : il part dans les archives.
- `site/data/history/<année>.json` : offres plus anciennes, chargées seulement par la page Archives (avec les offres expirées d'`offers.json`).
- `details` d'une offre : tags (5 au plus, sans « Jeu solo », « Multijoueur », « Free-to-play », « Accès anticipé »), description, 4 captures, vidéo. Epic fournit description et captures (redimensionnées par son CDN), pas de vidéo lisible ; ses tags viennent de Steam. Une source indisponible n'efface pas les détails connus (`mergeDetails`). Pas de capture ni de vidéo pour un jeu signalé pour nudité ou contenu sexuel (descripteurs Steam 1, 3, 4) ; la violence (2) et le « contenu adulte » général (5) restent affichés.
- `data/state.json` : dernière lecture de `GetAppList` et plus grand `price_change_number` vu.

## Développement

Prérequis : Node.js 24.

```bash
npm install
npm test            # tests (node:test)
npm run typecheck   # vérification des types (tsc)
npm run collect:dry # collecte réelle, sans écrire de fichier
npm run collect     # collecte réelle, écrit site/data et data/state.json
npm run serve       # http://localhost:8080
```

Clé Steam en local : copier `.env.example` en `.env.local` (ignoré par git) et y renseigner `STEAM_API_KEY`. Sans clé, la collecte Steam se limite à revérifier les offres déjà connues.

## Mise en place sur GitHub

1. Dépôt **public** (GitHub Pages n'est disponible que sur les dépôts publics du plan gratuit).
2. *Settings → Pages → Source* : **GitHub Actions**.
3. *Settings → Environments → github-pages* : branches de déploiement limitées à `main`.
4. *Settings → Secrets and variables → Actions* : secret de dépôt `STEAM_API_KEY`.

La clé n'existe que dans l'environnement de l'étape de collecte : elle n'est écrite dans aucun fichier, et seul `site/` est publié.

## Déclenchement par Cloudflare

Les exécutions planifiées de GitHub partaient avec 4 à 10 h de retard (relevé du 14 au 16 novembre 2026). Un Worker Cloudflare (`cron/`, compte gratuit) lance le workflow à l'heure via l'API `workflow_dispatch` (premiers déclenchements à l'heure le 17 novembre 2026). Le `schedule` de `update.yml` a ensuite été retiré : **le Worker est le seul déclencheur planifié**. S'il tombe en panne, plus aucune collecte automatique ; en attendant, lancer le workflow à la main (`gh workflow run update.yml --repo faimer-org/free-loot`, ou *Actions → Run workflow*).

- Cron Trigger en UTC (`45 5,6,15,16 * * *`) : `cron/schedule.ts` ne garde que l'exécution qui tombe à 7 h 45 ou 17 h 45 à Paris, été comme hiver (testé dans `tests/cron.test.ts`).
- Pas d'adresse publique (`workers_dev = false`) : le Worker ne fait rien d'autre que répondre à son déclencheur.
- Un refus de GitHub lève une exception : l'exécution apparaît en échec dans *Workers → free-loot-cron → Logs*.
- Modifier `cron/` ne relance pas le workflow (`paths-ignore`).

Jeton : *fine-grained*, propriétaire `faimer-org`, dépôt `free-loot` seul, permission **Actions : Read and write** et rien d'autre. Il n'est stocké que dans Cloudflare, en secret `GITHUB_TOKEN`. **Il expire le 17 novembre 2027** : le renouveler avant (puis `secret put` à nouveau et mettre à jour cette date), sinon le Worker échoue en 401 et les offres ne sont plus mises à jour.

Déploiement, depuis `cron/` (Wrangler n'est pas une dépendance du projet) :

```bash
npx wrangler@4.156.2 login
npx wrangler@4.156.2 secret put GITHUB_TOKEN   # colle le jeton, qui part directement chez Cloudflare
npx wrangler@4.156.2 deploy
```

## Points non vérifiés

- **Free Weekend** : le champ `free_weekend` de `GetItems` est confirmé (4 Free Weekends détectés le 2026-11-14). On ne sait pas si chaque Free Weekend fait apparaître l'app dans `GetAppList` : ceux-ci y figuraient sur une fenêtre de 14 jours.
- **Devenu gratuit** : repose sur l'hypothèse que `price_change_number` est un compteur global croissant. La collecte journalise sa plage de valeurs pour la vérifier.
- **Débit** : limites Steam non documentées ; environ 200 appels par 5 minutes pour `appdetails` selon la communauté.
- **Planification** : le `schedule` de GitHub partait avec 4 à 10 h de retard ; remplacé par le Worker Cloudflare, ponctuel à la minute les 17 novembre 2026 à 7 h 45 et 17 h 45 (fuseau `Europe/Paris` bien pris en charge par `Intl` dans le runtime Workers). Aucune alerte en cas d'échec du Worker : seuls ses journaux Cloudflare le montrent.
- **Tags des offres Epic** : le flux Epic ne donne que des identifiants de tags, et son API GraphQL est derrière une vérification anti-robot. Les tags sont repris du jeu Steam de même nom exact (casse, ponctuation, accents et ™ ® ignorés) : pas de tags si le jeu n'est pas sur Steam ou s'il y porte un autre nom ; un homonyme donnerait des tags faux. 3 offres Epic sur 3 trouvées le 2026-11-14.
- **API de détails** : `GetTagList`, `storesearch` et les champs `tags`, `screenshots`, `trailers` de `GetItems` ne sont pas documentés par Valve ; testés sans clé le 2026-11-14. Les adresses des micro-bandes-annonces (`store_trailers/…/microtrailer.mp4`) sont reconstituées à partir de la redirection observée.
