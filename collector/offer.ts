export type Store = 'epic' | 'steam';

/**
 * - free_to_keep : jeu payant offert pour une durée limitée, conservé une fois récupéré.
 * - free_weekend : jouable gratuitement pendant un événement, à acheter ensuite.
 * - now_free     : jeu auparavant payant, devenu gratuit sans date de fin.
 */
export type OfferType = 'free_to_keep' | 'free_weekend' | 'now_free';

export interface BaseGame {
  title: string;
  url: string | null;
}

/** Remise payante en cours pendant un Free Weekend. */
export interface Discount {
  /** Prix remisé en centimes, dans la devise de l'offre. */
  price: number;
  /** Pourcentage de remise (67 pour -67 %). */
  percent: number;
  /** Fin de la remise, date ISO 8601 (UTC) ; null si inconnue. */
  endDate: string | null;
}

/** Offre publiée dans site/data/offers.json : uniquement des données publiques. */
export interface Offer {
  /** Identifiant unique d'une occurrence d'offre (un même jeu peut être offert plusieurs fois). */
  id: string;
  store: Store;
  /** Identifiant du produit dans le magasin : appid Steam, « namespace:id » Epic. */
  storeId: string;
  type: OfferType;
  title: string;
  isDlc: boolean;
  baseGame: BaseGame | null;
  /** Prix d'origine en centimes, null si inconnu. */
  originalPrice: number | null;
  currency: string | null;
  /**
   * Free Weekend seulement : remise en cours sur le jeu, null sinon.
   * Absent des offres enregistrées avant l'ajout du champ (offers.json, historique) et des offres Epic.
   */
  discount?: Discount | null;
  /** Dates ISO 8601 (UTC). */
  startDate: string | null;
  endDate: string | null;
  url: string;
  image: string | null;
  firstSeen: string;
  lastSeen: string;
}

/** Offre détectée pendant une exécution, avant fusion avec l'état. */
export type DetectedOffer = Omit<Offer, 'id' | 'firstSeen' | 'lastSeen'>;

export function toIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}
