import { fetchJson } from '../http.ts';

// https://partner.steamgames.com/doc/webapi/IStoreService#GetAppList
const APP_LIST_URL = 'https://api.steampowered.com/IStoreService/GetAppList/v1/';
const PAGE_SIZE = 50_000;

export interface AppListEntry {
  appid: number;
  name: string;
  last_modified: number;
  price_change_number: number;
}

interface AppListResponse {
  response: {
    apps?: AppListEntry[];
    have_more_results?: boolean;
    last_appid?: number;
  };
}

/** Jeux et DLC modifiés (informations ou prix) depuis `since` (secondes Unix). */
export async function fetchModifiedApps(apiKey: string, since: number): Promise<AppListEntry[]> {
  const apps: AppListEntry[] = [];
  let lastAppid: number | undefined;

  for (let page = 1; page <= 20; page++) {
    const params = new URLSearchParams({
      key: apiKey,
      if_modified_since: String(since),
      include_games: 'true',
      include_dlc: 'true',
      max_results: String(PAGE_SIZE),
    });
    if (lastAppid !== undefined) params.set('last_appid', String(lastAppid));

    const json = await fetchJson<AppListResponse>(`${APP_LIST_URL}?${params}`, {
      label: `Steam GetAppList (page ${page})`,
    });
    apps.push(...(json.response.apps ?? []));
    if (!json.response.have_more_results || json.response.last_appid === undefined) {
      return apps;
    }
    lastAppid = json.response.last_appid;
  }
  throw new Error('Steam GetAppList : pagination anormalement longue, arrêt');
}
