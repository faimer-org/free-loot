import { cleanDescription } from '../details.ts';
import { fetchJson, sleep } from '../http.ts';
import type { DetectedOffer, Details } from '../offer.ts';
import { getItems, type StoreItem } from './storeBrowse.ts';

// IStoreService/GetTagList : sans clé, noms des tags dans la langue demandée (testé le 2026-11-14, 446 tags).
const TAG_LIST_URL = 'https://api.steampowered.com/IStoreService/GetTagList/v1/?language=french';
// store.steampowered.com/api/storesearch : sans clé, recherche par nom (testé le 2026-11-14).
const STORE_SEARCH_URL = 'https://store.steampowered.com/api/storesearch/';
const ASSETS_BASE = 'https://shared.fastly.steamstatic.com/store_item_assets/';
// Les URL des micro-bandes-annonces (`trailer_url_format` : steam/apps/…) redirigent ici.
const VIDEOS_BASE = 'https://video.fastly.steamstatic.com/store_trailers/';

export const MAX_TAGS = 5;
export const MAX_SCREENSHOTS = 4;

/** Tags qui décrivent un mode de jeu ou un statut plutôt que le jeu : sans intérêt sur une carte. */
const IGNORED_TAGS = new Set([
  4182, // Jeu solo
  3859, // Multijoueur
  113, // Free-to-play
  493, // Accès anticipé
]);

/** Nudité ou contenu sexuel : pas de capture ni de vidéo pour ces jeux. Violence et contenu adulte général restent affichés. */
const HIDE_MEDIA_DESCRIPTORS = new Set([1, 3, 4]);

const DETAILS_REQUEST = {
  include_basic_info: true,
  include_tag_count: 10,
  include_screenshots: true,
  include_trailers: true,
};

/**
 * Complète les offres détectées avec les détails Steam : tout pour une offre Steam, les tags seuls pour une offre Epic
 * dont le jeu est vendu sur Steam sous le même nom. Une erreur n'empêche pas la collecte : les détails déjà connus
 * sont conservés à la fusion (mergeDetails).
 */
export async function addDetails(offers: DetectedOffer[]): Promise<void> {
  if (offers.length === 0) return;
  let tagNames: Map<number, string>;
  try {
    tagNames = await fetchTagNames();
  } catch (error) {
    console.warn(`::warning::Tags Steam indisponibles : ${(error as Error).message}`);
    tagNames = new Map();
  }

  const steamOffers = offers.filter((offer) => offer.store === 'steam');
  try {
    const details = await fetchSteamDetails([...new Set(steamOffers.map((offer) => Number(offer.storeId)))], tagNames);
    for (const offer of steamOffers) {
      const found = details.get(Number(offer.storeId));
      if (found) offer.details = found;
    }
  } catch (error) {
    console.warn(`::warning::Détails Steam indisponibles : ${(error as Error).message}`);
  }

  if (tagNames.size === 0) return;
  const epicOffers = offers.filter((offer) => offer.store === 'epic' && !offer.isDlc);
  const appids = new Map<DetectedOffer, number>();
  for (const offer of epicOffers) {
    try {
      const appid = await findSteamApp(offer.title);
      if (appid !== null) appids.set(offer, appid);
    } catch (error) {
      console.warn(`Recherche Steam de « ${offer.title} » impossible : ${(error as Error).message}`);
    }
    await sleep(300);
  }
  try {
    const details = await fetchSteamDetails([...new Set(appids.values())], tagNames);
    for (const [offer, appid] of appids) {
      const tags = details.get(appid)?.tags ?? [];
      if (tags.length > 0 && offer.details) offer.details.tags = tags;
    }
  } catch (error) {
    console.warn(`::warning::Tags des offres Epic indisponibles : ${(error as Error).message}`);
  }
  console.log(`Détails : ${steamOffers.length} offre(s) Steam, tags Steam trouvés pour ${appids.size}/${epicOffers.length} offre(s) Epic`);
}

interface TagListResponse {
  response: { tags?: { tagid: number; name: string }[] };
}

export async function fetchTagNames(): Promise<Map<number, string>> {
  const json = await fetchJson<TagListResponse>(TAG_LIST_URL, { label: 'Steam GetTagList' });
  return new Map((json.response.tags ?? []).map((tag) => [tag.tagid, tag.name]));
}

/** Détails des apps Steam demandées ; une app absente de GetItems n'a pas d'entrée. */
export async function fetchSteamDetails(appids: number[], tagNames: Map<number, string>): Promise<Map<number, Details>> {
  if (appids.length === 0) return new Map();
  const items = await getItems(appids, DETAILS_REQUEST);
  return new Map(items.map((item) => [item.appid ?? item.id, steamDetails(item, tagNames)]));
}

export function steamDetails(item: StoreItem, tagNames: Map<number, string>): Details {
  const hideMedia = (item.content_descriptorids ?? []).some((id) => HIDE_MEDIA_DESCRIPTORS.has(id));
  return {
    tags: steamTags(item, tagNames),
    description: cleanDescription(item.basic_info?.short_description),
    screenshots: hideMedia ? [] : screenshots(item),
    video: hideMedia ? null : microtrailer(item),
  };
}

export function steamTags(item: StoreItem, tagNames: Map<number, string>): string[] {
  return [...(item.tags ?? [])]
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .filter((tag) => !IGNORED_TAGS.has(tag.tagid))
    .map((tag) => tagNames.get(tag.tagid))
    .filter((name) => name !== undefined)
    .slice(0, MAX_TAGS);
}

/** Captures « tout public » si le jeu en a, sinon celles marquées « contenu adulte » (violence comprise). */
function screenshots(item: StoreItem): string[] {
  const all = item.screenshots?.all_ages_screenshots?.length
    ? item.screenshots.all_ages_screenshots
    : (item.screenshots?.mature_content_screenshots ?? []);
  return [...all]
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
    .slice(0, MAX_SCREENSHOTS)
    .map((shot) => ASSETS_BASE + shot.filename.replace(/\.jpg(?=\?|$)/, '.600x338.jpg'));
}

/** Micro-bande-annonce mp4 de la première bande-annonce qui en a une. */
function microtrailer(item: StoreItem): string | null {
  for (const trailer of item.trailers?.highlights ?? []) {
    const mp4 = trailer.microtrailer?.find((file) => file.type === 'video/mp4');
    if (mp4) return VIDEOS_BASE + mp4.filename;
  }
  return null;
}

interface StoreSearchResponse {
  items?: { type: string; name: string; id: number }[];
}

/** Appid Steam d'un jeu dont le nom correspond exactement (casse, ponctuation et symboles ™ ® ignorés), sinon null. */
export async function findSteamApp(title: string): Promise<number | null> {
  const params = new URLSearchParams({ term: title, cc: 'fr', l: 'french' });
  const json = await fetchJson<StoreSearchResponse>(`${STORE_SEARCH_URL}?${params}`, { label: 'Steam storesearch' });
  return matchSteamApp(json.items ?? [], title);
}

export function matchSteamApp(results: { type: string; name: string; id: number }[], title: string): number | null {
  const wanted = normalizeTitle(title);
  if (!wanted) return null;
  const match = results.find((result) => result.type === 'app' && normalizeTitle(result.name) === wanted);
  return match?.id ?? null;
}

export function normalizeTitle(title: string): string {
  return title
    .replace(/[™®©]/g, '')
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '') // accents séparés par NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
