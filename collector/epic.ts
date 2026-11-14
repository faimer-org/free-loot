import { fetchJson } from './http.ts';
import type { DetectedOffer } from './offer.ts';

export const EPIC_URL =
  'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=fr&country=FR&allowCountries=FR';

const STORE_PAGE = 'https://store.epicgames.com/fr/p/';
const FREE_GAMES_PAGE = 'https://store.epicgames.com/fr/free-games';

// Sous-ensemble de la réponse utilisé ici (observé le 2026-11-14).
interface EpicPromotion {
  startDate: string;
  endDate: string;
  discountSetting: { discountType: string; discountPercentage: number };
}

interface EpicElement {
  title: string;
  id: string;
  namespace: string;
  offerType: string;
  productSlug: string | null;
  urlSlug?: string | null;
  keyImages?: { type: string; url: string }[];
  categories?: { path: string }[];
  catalogNs?: { mappings: { pageSlug: string; pageType: string }[] | null } | null;
  offerMappings?: { pageSlug: string; pageType: string }[] | null;
  price?: { totalPrice: { originalPrice: number; discountPrice: number; currencyCode: string } };
  promotions?: {
    promotionalOffers: { promotionalOffers: EpicPromotion[] }[];
    upcomingPromotionalOffers: { promotionalOffers: EpicPromotion[] }[];
  } | null;
}

export interface EpicResponse {
  data: { Catalog: { searchStore: { elements: EpicElement[] } } };
}

export async function fetchEpicOffers(): Promise<DetectedOffer[]> {
  const json = await fetchJson<EpicResponse>(EPIC_URL, { label: 'Epic freeGamesPromotions' });
  return parseEpic(json);
}

/**
 * Garde les promotions gratuites, en cours et à venir.
 * Particularité Epic : `discountPercentage` est le pourcentage du prix qui reste à payer,
 * une offre gratuite a donc `discountPercentage === 0`.
 */
export function parseEpic(json: EpicResponse): DetectedOffer[] {
  const offers: DetectedOffer[] = [];
  for (const element of json.data.Catalog.searchStore.elements) {
    const promotions = element.promotions;
    if (!promotions) continue;

    const current = promotions.promotionalOffers.flatMap((group) => group.promotionalOffers);
    const upcoming = promotions.upcomingPromotionalOffers.flatMap((group) => group.promotionalOffers);

    for (const promotion of [...current, ...upcoming]) {
      if (!isFree(promotion)) continue;
      offers.push(toOffer(element, promotion));
    }
  }
  return dedupe(offers);
}

function isFree(promotion: EpicPromotion): boolean {
  return promotion.discountSetting.discountType === 'PERCENTAGE' && promotion.discountSetting.discountPercentage === 0;
}

function toOffer(element: EpicElement, promotion: EpicPromotion): DetectedOffer {
  const isDlc = isAddOn(element);
  const slug = pageSlug(element);
  const total = element.price?.totalPrice;
  return {
    store: 'epic',
    storeId: `${element.namespace}:${element.id}`,
    type: 'free_to_keep',
    title: element.title,
    isDlc,
    baseGame: isDlc ? baseGame(element) : null,
    originalPrice: total && total.originalPrice > 0 ? total.originalPrice : null,
    currency: total?.currencyCode ?? null,
    startDate: new Date(promotion.startDate).toISOString(),
    endDate: new Date(promotion.endDate).toISOString(),
    url: slug ? STORE_PAGE + slug : FREE_GAMES_PAGE,
    image: coverImage(element),
  };
}

function isAddOn(element: EpicElement): boolean {
  if (element.offerType === 'ADD_ON' || element.offerType === 'DLC') return true;
  return (element.categories ?? []).some((category) => category.path === 'addons');
}

function pageSlug(element: EpicElement): string | null {
  const mapping = (element.offerMappings ?? []).find((m) => m.pageSlug);
  if (mapping) return mapping.pageSlug;
  const productHome = (element.catalogNs?.mappings ?? []).find((m) => m.pageType === 'productHome');
  if (productHome && !isAddOn(element)) return productHome.pageSlug;
  const slug = element.productSlug ?? element.urlSlug ?? null;
  if (!slug || slug === '[]') return null;
  return slug.replace(/\/home$/, '');
}

/**
 * Le flux ne donne pas le nom du jeu de base d'un DLC, seulement le slug de sa page produit
 * (`catalogNs.mappings`, pageType « productHome »). Le titre est déduit du slug : approximatif.
 */
function baseGame(element: EpicElement): { title: string; url: string } | null {
  const productHome = (element.catalogNs?.mappings ?? []).find((m) => m.pageType === 'productHome');
  if (!productHome) return null;
  return { title: titleFromSlug(productHome.pageSlug), url: STORE_PAGE + productHome.pageSlug };
}

export function titleFromSlug(slug: string): string {
  const words = slug
    .replace(/-[0-9a-f]{6}$/, '')
    .split('-')
    .filter(Boolean);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

const IMAGE_PREFERENCE = ['OfferImageTall', 'Thumbnail', 'DieselStoreFrontTall', 'OfferImageWide', 'DieselStoreFrontWide'];

function coverImage(element: EpicElement): string | null {
  const images = element.keyImages ?? [];
  for (const type of IMAGE_PREFERENCE) {
    const image = images.find((candidate) => candidate.type === type && candidate.url.startsWith('https://'));
    if (image) return image.url;
  }
  return null;
}

function dedupe(offers: DetectedOffer[]): DetectedOffer[] {
  const seen = new Map<string, DetectedOffer>();
  for (const offer of offers) {
    seen.set(`${offer.storeId}|${offer.startDate}`, offer);
  }
  return [...seen.values()];
}
