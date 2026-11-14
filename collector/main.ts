import { offerStatus } from '../site/js/status.js';
import { fetchEpicOffers } from './epic.ts';
import type { DetectedOffer } from './offer.ts';
import {
  appendHistory,
  emptyOffers,
  emptyState,
  mergeOffers,
  PATHS,
  readJson,
  splitArchived,
  writeJson,
  type HistoryFile,
  type OffersFile,
  type State,
} from './state.ts';
import { addDetails } from './steam/details.ts';
import { collectSteam } from './steam/index.ts';

const HOUR = 3600;
/** Marge de recouvrement entre deux exécutions (retards du planificateur, horloges). */
const OVERLAP_SECONDS = 2 * HOUR;
/** Premier lancement : fenêtre de recherche des apps Steam modifiées. */
const FIRST_RUN_DAYS = 14;

const dryRun = process.argv.includes('--dry-run');
const now = new Date();
const nowSeconds = Math.floor(now.getTime() / 1000);

const state = readJson<State>(PATHS.state, emptyState());
const offersFile = readJson<OffersFile>(PATHS.offers, emptyOffers());

const detected: DetectedOffer[] = [];
let steamChecked = new Set<number>();
let sourcesRead = 0;

try {
  const epic = await fetchEpicOffers();
  console.log(`Epic : ${epic.length} offre(s) gratuite(s)`);
  detected.push(...epic);
  sourcesRead++;
} catch (error) {
  console.error(`::warning::Epic ignoré : ${(error as Error).message}`);
}

try {
  const since = state.steam.lastRun
    ? Math.floor(Date.parse(state.steam.lastRun) / 1000) - OVERLAP_SECONDS
    : nowSeconds - FIRST_RUN_DAYS * 24 * HOUR;
  const recheck = offersFile.offers
    .filter((offer) => offer.store === 'steam' && offerStatus(offer, now.getTime()) !== 'expired')
    .map((offer) => Number(offer.storeId));

  const steam = await collectSteam({
    apiKey: process.env.STEAM_API_KEY || undefined,
    since,
    lastMaxPriceChange: state.steam.maxPriceChange,
    recheck,
    now,
  });
  console.log(`Steam : ${steam.offers.length} offre(s) gratuite(s)`);
  detected.push(...steam.offers);
  steamChecked = steam.checkedAppids;
  if (steam.appListRead) {
    state.steam.lastRun = now.toISOString();
    state.steam.maxPriceChange = steam.maxPriceChange;
  }
  sourcesRead++;
} catch (error) {
  console.error(`::warning::Steam ignoré : ${(error as Error).message}`);
}

if (sourcesRead === 0) {
  console.error('::error::Aucune source lue, fichiers inchangés');
  process.exit(1);
}

await addDetails(detected);

const merged = mergeOffers(offersFile.offers, detected, { now, steamChecked });
const { current, archived } = splitArchived(merged, now);

const counts = Map.groupBy(current, (offer) => offerStatus(offer, now.getTime()));
console.log(
  `Offres : ${counts.get('active')?.length ?? 0} en cours, ${counts.get('upcoming')?.length ?? 0} à venir, ` +
    `${counts.get('expired')?.length ?? 0} expirées récemment, ${archived.length} archivée(s)`,
);

if (dryRun) {
  for (const offer of detected) {
    console.log(`  [${offer.store}] ${offer.type} ${offer.isDlc ? '(DLC) ' : ''}${offer.title} → ${offer.endDate ?? 'sans fin'}`);
    const details = offer.details;
    if (details) {
      console.log(
        `      tags : ${details.tags.join(', ') || '—'} · ${details.screenshots.length} capture(s)` +
          ` · vidéo : ${details.video ? 'oui' : 'non'} · description : ${details.description ? 'oui' : 'non'}`,
      );
    }
  }
  console.log('--dry-run : aucun fichier écrit');
} else {
  const years = appendHistory(
    archived,
    (year) => readJson<HistoryFile>(PATHS.history(year), { year, offers: [] }),
    (file) => writeJson(PATHS.history(file.year), file),
  );
  const historyYears = [...new Set([...offersFile.historyYears, ...years])].sort();
  writeJson(PATHS.offers, { generatedAt: now.toISOString(), historyYears, offers: current } satisfies OffersFile);
  writeJson(PATHS.state, state);
}
