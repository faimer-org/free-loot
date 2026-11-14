import type { DetectedOffer } from '../offer.ts';
import { fetchPrices } from './appDetails.ts';
import { fetchModifiedApps } from './appList.ts';
import { appidOf, classifySteamItem } from './classify.ts';
import { getItems } from './storeBrowse.ts';

export interface SteamRunInput {
  /** Absente : seules les offres déjà connues sont revérifiées (GetItems ne demande pas de clé). */
  apiKey: string | undefined;
  /** Secondes Unix : apps modifiées depuis cet instant. */
  since: number;
  /** Plus grand `price_change_number` vu à l'exécution précédente (0 au premier lancement). */
  lastMaxPriceChange: number;
  /** Apps des offres Steam encore actives, à revérifier même si elles n'ont pas changé. */
  recheck: number[];
  now: Date;
}

export interface SteamRunResult {
  offers: DetectedOffer[];
  /** Apps effectivement lues avec GetItems : seules celles-ci peuvent clore une offre. */
  checkedAppids: Set<number>;
  maxPriceChange: number;
  /** Vrai si la liste des apps modifiées a été lue (le curseur peut alors avancer). */
  appListRead: boolean;
}

export async function collectSteam(input: SteamRunInput): Promise<SteamRunResult> {
  const priceChanges = new Map<number, number>();
  let appListRead = false;
  let maxPriceChange = input.lastMaxPriceChange;

  if (input.apiKey) {
    const modified = await fetchModifiedApps(input.apiKey, input.since);
    appListRead = true;
    for (const app of modified) {
      priceChanges.set(app.appid, app.price_change_number);
      maxPriceChange = Math.max(maxPriceChange, app.price_change_number);
    }
    logAppListStats(modified.map((app) => app.price_change_number), input.lastMaxPriceChange);
  } else {
    console.warn('STEAM_API_KEY absente : pas de recherche de nouvelles offres Steam, revérification seulement');
  }

  const candidates = [...new Set([...priceChanges.keys(), ...input.recheck])];
  const items = await getItems(candidates);
  const checkedAppids = new Set(items.map(appidOf));
  console.log(`Steam : ${candidates.length} apps à vérifier, ${items.length} lues`);

  // Premier lancement (pas de référence) : on ne peut pas savoir quels prix ont changé, pas de « devenu gratuit ».
  const priceChangedSinceLastRun = (appid: number) =>
    input.lastMaxPriceChange > 0 && (priceChanges.get(appid) ?? 0) > input.lastMaxPriceChange;

  const detections = items
    .map((item) => classifySteamItem(item, { now: input.now, priceChangedSinceLastRun }))
    .filter((detection) => detection !== null);

  await fillBaseGameNames(detections);
  const offers = await crossCheckWithAppDetails(detections.map((detection) => detection.offer));

  return { offers, checkedAppids, maxPriceChange, appListRead };
}

async function fillBaseGameNames(detections: { offer: DetectedOffer; parentAppid: number | null }[]): Promise<void> {
  const parentIds = [...new Set(detections.map((d) => d.parentAppid).filter((id) => id !== null))];
  if (parentIds.length === 0) return;
  const parents = await getItems(parentIds);
  const names = new Map(parents.map((item) => [appidOf(item), item.name]));
  for (const { offer, parentAppid } of detections) {
    const name = parentAppid !== null ? names.get(parentAppid) : undefined;
    if (offer.baseGame && name) offer.baseGame.title = name;
  }
}

/**
 * Recoupe les Free to Keep avec appdetails (prix de la boutique en France).
 * Une remise affichée différente de 100 % écarte l'offre ; un échec d'appdetails ne bloque pas.
 */
async function crossCheckWithAppDetails(offers: DetectedOffer[]): Promise<DetectedOffer[]> {
  const toCheck = offers.filter((offer) => offer.type === 'free_to_keep').map((offer) => Number(offer.storeId));
  if (toCheck.length === 0) return offers;

  let prices;
  try {
    prices = await fetchPrices(toCheck);
  } catch (error) {
    console.warn(`::warning::Recoupement appdetails impossible : ${(error as Error).message}`);
    return offers;
  }
  return offers.filter((offer) => {
    if (offer.type !== 'free_to_keep') return true;
    const price = prices.get(Number(offer.storeId));
    if (price && price.discount_percent !== 100) {
      console.warn(`Steam ${offer.storeId} écarté : appdetails indique -${price.discount_percent} %`);
      return false;
    }
    return true;
  });
}

/** Journalise de quoi vérifier l'hypothèse « price_change_number est un compteur global croissant ». */
function logAppListStats(numbers: number[], lastMax: number): void {
  if (numbers.length === 0) {
    console.log('Steam GetAppList : aucune app modifiée');
    return;
  }
  // Pas de Math.min(...numbers) : la liste peut dépasser la taille de pile autorisée.
  const min = numbers.reduce((a, b) => Math.min(a, b));
  const max = numbers.reduce((a, b) => Math.max(a, b));
  const above = numbers.filter((n) => n > lastMax).length;
  console.log(
    `Steam GetAppList : ${numbers.length} apps modifiées, price_change_number de ${min} à ${max}, ` +
      `${above} au-dessus du maximum précédent (${lastMax})`,
  );
}
