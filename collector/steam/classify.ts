import { toIso, type DetectedOffer, type Discount, type OfferType } from '../offer.ts';
import { APP_TYPE_DLC, APP_TYPE_GAME, type PurchaseOption, type StoreItem } from './storeBrowse.ts';

const ASSETS_BASE = 'https://shared.fastly.steamstatic.com/store_item_assets/';
const DAY = 86_400_000;
/** Un jeu gratuit sorti depuis moins longtemps est considéré comme un free-to-play, pas comme « devenu gratuit ». */
const NOW_FREE_MIN_AGE_DAYS = 30;

export interface ClassifyContext {
  now: Date;
  /**
   * Vrai si le prix de l'app a changé depuis la dernière exécution.
   * Sert à distinguer un jeu devenu gratuit d'un free-to-play qui l'a toujours été.
   */
  priceChangedSinceLastRun(appid: number): boolean;
}

export interface SteamDetection {
  offer: DetectedOffer;
  /** Pour un DLC : appid du jeu de base, dont le nom est récupéré ensuite. */
  parentAppid: number | null;
}

export function appidOf(item: StoreItem): number {
  return item.appid ?? item.id;
}

/** Classe une app Steam, ou renvoie null si ce n'est pas une offre gratuite temporaire. */
export function classifySteamItem(item: StoreItem, context: ClassifyContext): SteamDetection | null {
  if (item.type !== APP_TYPE_GAME && item.type !== APP_TYPE_DLC) return null; // démos, vidéos, logiciels…
  if (item.visible === false || item.release?.is_coming_soon) return null;

  const appid = appidOf(item);
  const now = context.now.getTime();
  const purchase = item.best_purchase_option;
  const originalPrice = purchase?.original_price_in_cents ? Number(purchase.original_price_in_cents) : null;
  const finalPrice = purchase?.final_price_in_cents !== undefined ? Number(purchase.final_price_in_cents) : null;

  // 1. Free Weekend : champ `free_weekend` (observé le 2026-11-14, souvent couplé à une remise).
  // `original_price_in_cents` n'existe qu'en cas de remise ; sinon le prix normal est le prix final.
  const weekend = item.free_weekend;
  if (weekend?.end_time && weekend.end_time * 1000 > now) {
    return detection(item, 'free_weekend', {
      originalPrice: originalPrice ?? (finalPrice && finalPrice > 0 ? finalPrice : null),
      startDate: weekend.start_time ? toIso(weekend.start_time) : null,
      endDate: toIso(weekend.end_time),
      discount: weekendDiscount(purchase, originalPrice, finalPrice),
    });
  }

  // 2. Free to Keep : prix d'origine > 0, prix final à 0. La date de fin vient de la remise active.
  if (originalPrice !== null && originalPrice > 0 && finalPrice === 0) {
    const ends = (purchase?.active_discounts ?? [])
      .map((discount) => discount.discount_end_date ?? 0)
      .filter((end) => end > 0);
    return detection(item, 'free_to_keep', {
      originalPrice,
      startDate: null,
      endDate: ends.length > 0 ? toIso(Math.max(...ends)) : null,
    });
  }

  // 3. Gratuit temporairement sans dates connues (champ `is_free_temporarily`, non observé en conditions réelles).
  if (item.is_free_temporarily) {
    return detection(item, 'free_weekend', { originalPrice, startDate: null, endDate: null });
  }

  // 4. Devenu gratuit : gratuit, prix modifié depuis la dernière exécution, sorti depuis plus de 30 jours.
  if (item.is_free && context.priceChangedSinceLastRun(appid)) {
    const released = item.release?.steam_release_date;
    if (released && now - released * 1000 > NOW_FREE_MIN_AGE_DAYS * DAY) {
      return detection(item, 'now_free', { originalPrice: null, startDate: null, endDate: null });
    }
  }

  return null;
}

/**
 * Remise payante en cours pendant un Free Weekend (observée le 2026-11-14 sur Company of Heroes 3).
 * Avec plusieurs remises actives, la fin retenue est la plus proche : le prix n'est garanti que jusque-là.
 */
function weekendDiscount(
  purchase: PurchaseOption | undefined,
  originalPrice: number | null,
  finalPrice: number | null,
): Discount | null {
  if (originalPrice === null || finalPrice === null || finalPrice <= 0 || originalPrice <= finalPrice) return null;
  const ends = (purchase?.active_discounts ?? [])
    .map((discount) => discount.discount_end_date ?? 0)
    .filter((end) => end > 0);
  return {
    price: finalPrice,
    percent: purchase?.discount_pct ?? Math.round((1 - finalPrice / originalPrice) * 100),
    endDate: ends.length > 0 ? toIso(Math.min(...ends)) : null,
  };
}

function detection(
  item: StoreItem,
  type: OfferType,
  fields: Pick<DetectedOffer, 'originalPrice' | 'startDate' | 'endDate'> & { discount?: Discount | null },
): SteamDetection {
  const appid = appidOf(item);
  const isDlc = item.type === APP_TYPE_DLC;
  const parentAppid = isDlc ? (item.related_items?.parent_appid ?? null) : null;
  return {
    offer: {
      store: 'steam',
      storeId: String(appid),
      type,
      title: item.name ?? `App ${appid}`,
      isDlc,
      baseGame: parentAppid ? { title: `App ${parentAppid}`, url: storeUrl(parentAppid) } : null,
      originalPrice: fields.originalPrice,
      currency: fields.originalPrice !== null ? 'EUR' : null,
      // Toujours renseigné pour Steam : la fusion remet ainsi à null une remise terminée.
      discount: fields.discount ?? null,
      startDate: fields.startDate,
      endDate: fields.endDate,
      url: storeUrl(appid),
      image: coverImage(item),
    },
    parentAppid,
  };
}

export function storeUrl(appid: number): string {
  return `https://store.steampowered.com/app/${appid}/`;
}

/** Jaquette verticale (600×900) si elle existe, sinon l'en-tête. Les DLC n'ont souvent que l'en-tête. */
export function coverImage(item: StoreItem): string | null {
  const assets = item.assets;
  const file = assets?.library_capsule ?? assets?.header ?? assets?.main_capsule;
  if (!assets?.asset_url_format || !file) return null;
  return ASSETS_BASE + assets.asset_url_format.replace('${FILENAME}', file);
}
