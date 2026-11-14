import { fetchJson } from '../http.ts';

// store.steampowered.com/api/appdetails : plusieurs appids par appel seulement avec filters=price_overview.
// Limite non documentée par Valve, environ 200 appels par 5 minutes selon la communauté.
const APP_DETAILS_URL = 'https://store.steampowered.com/api/appdetails';
const BATCH_SIZE = 50;

export interface PriceOverview {
  currency: string;
  initial: number;
  final: number;
  discount_percent: number;
}

type AppDetailsResponse = Record<string, { success: boolean; data?: { price_overview?: PriceOverview } | [] }>;

/**
 * Prix vus par la boutique (France) pour recouper la détection faite avec GetItems.
 * Une app absente du résultat n'a pas de prix (gratuite) ou n'est pas disponible.
 */
export async function fetchPrices(appids: number[]): Promise<Map<number, PriceOverview>> {
  const prices = new Map<number, PriceOverview>();
  for (let offset = 0; offset < appids.length; offset += BATCH_SIZE) {
    const batch = appids.slice(offset, offset + BATCH_SIZE);
    const params = new URLSearchParams({ appids: batch.join(','), cc: 'fr', filters: 'price_overview' });
    const json = await fetchJson<AppDetailsResponse>(`${APP_DETAILS_URL}?${params}`, {
      label: 'Steam appdetails',
    });
    for (const [appid, entry] of Object.entries(json)) {
      const overview = entry.success && !Array.isArray(entry.data) ? entry.data?.price_overview : undefined;
      if (overview) prices.set(Number(appid), overview);
    }
  }
  return prices;
}
