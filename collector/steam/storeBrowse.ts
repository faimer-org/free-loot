import { fetchJson, sleep } from '../http.ts';

// IStoreBrowseService/GetItems : sans clé. 250 apps par appel testé le 2026-11-14.
// Champs : https://github.com/SteamDatabase/SteamTracking/blob/master/Protobufs/steammessages_storebrowse.steamclient.proto
const GET_ITEMS_URL = 'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/';
export const BATCH_SIZE = 250;

/** EStoreAppType */
export const APP_TYPE_GAME = 0;
export const APP_TYPE_DEMO = 1;
export const APP_TYPE_DLC = 4;

export interface StoreDiscount {
  discount_amount?: string;
  discount_description?: string;
  discount_end_date?: number;
}

export interface PurchaseOption {
  packageid?: number;
  bundleid?: number;
  final_price_in_cents?: string;
  original_price_in_cents?: string;
  discount_pct?: number;
  active_discounts?: StoreDiscount[];
}

export interface StoreItem {
  id: number;
  appid?: number;
  success: number;
  visible?: boolean;
  name?: string;
  store_url_path?: string;
  type?: number;
  is_free?: boolean;
  is_free_temporarily?: boolean;
  related_items?: { parent_appid?: number };
  assets?: {
    asset_url_format?: string;
    library_capsule?: string;
    header?: string;
    main_capsule?: string;
  };
  release?: { steam_release_date?: number; is_coming_soon?: boolean };
  best_purchase_option?: PurchaseOption;
  free_weekend?: { start_time?: number; end_time?: number; text?: string; appid?: number };
}

interface GetItemsResponse {
  response: { store_items?: StoreItem[] };
}

export async function getItems(appids: number[]): Promise<StoreItem[]> {
  const items: StoreItem[] = [];
  for (let offset = 0; offset < appids.length; offset += BATCH_SIZE) {
    const batch = appids.slice(offset, offset + BATCH_SIZE);
    const input = {
      ids: batch.map((appid) => ({ appid })),
      context: { language: 'french', country_code: 'FR' },
      data_request: { include_basic_info: true, include_assets: true, include_release: true },
    };
    const url = `${GET_ITEMS_URL}?${new URLSearchParams({ input_json: JSON.stringify(input) })}`;
    const json = await fetchJson<GetItemsResponse>(url, {
      label: `Steam GetItems (${offset + batch.length}/${appids.length})`,
    });
    items.push(...(json.response.store_items ?? []).filter((item) => item.success === 1));
    if (offset + BATCH_SIZE < appids.length) await sleep(500);
  }
  return items;
}
