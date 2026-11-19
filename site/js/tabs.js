// Onglets « Offres en cours » et « Devenus gratuits » : répartition des offres entre les deux pages,
// et badge « NEW » tant qu'une offre détectée depuis la dernière visite de la page n'a pas été vue.

import { el } from './common.js';
import { offerStatus } from './status.js';

/** @typedef {import('../../collector/offer.ts').Offer} Offer */
/** @typedef {'home' | 'nowFree'} TabPage */

// Préfixe localStorage du projet dans l'organisation : « fl- ».
const STORAGE_KEY = 'fl-seen';
/** Première visite : seules les offres détectées depuis ce nombre de jours comptent comme nouvelles. */
const FIRST_VISIT_DAYS = 7;
const DAY = 86_400_000;

/** @type {Record<TabPage, string>} */
const TAB_HREFS = { home: './', nowFree: 'devenus-gratuits.html' };

/**
 * Offre de la page Offres en cours : en cours ou à venir, hors jeux devenus gratuits.
 * @param {Offer} offer
 * @param {number} now
 */
export function isHomeOffer(offer, now) {
  return offer.type !== 'now_free' && offerStatus(offer, now) !== 'expired';
}

/**
 * Offre de la page Devenus gratuits : jeu devenu gratuit, encore gratuit.
 * @param {Offer} offer
 * @param {number} now
 */
export function isNowFreeOffer(offer, now) {
  return offer.type === 'now_free' && offerStatus(offer, now) !== 'expired';
}

/** @type {Record<TabPage, (offer: Offer, now: number) => boolean>} */
const BELONGS = { home: isHomeOffer, nowFree: isNowFreeOffer };

/**
 * Affiche « NEW » sur les onglets qui ont des offres pas encore vues, et marque la page courante comme vue.
 * Référence : la date de génération des données affichées, car une offre détectée par une collecte
 * a pour `firstSeen` la date de génération de cette collecte.
 * @param {{ generatedAt?: unknown, offers?: unknown }} data contenu d'offers.json
 * @param {TabPage | null} current page affichée, null pour les Archives
 */
export function markTabs(data, current) {
  const offers = /** @type {Offer[]} */ (Array.isArray(data.offers) ? data.offers : []);
  const generatedAt = typeof data.generatedAt === 'string' && !Number.isNaN(Date.parse(data.generatedAt)) ? data.generatedAt : null;
  const now = Date.now();
  const seen = loadSeen();
  const firstVisit = now - FIRST_VISIT_DAYS * DAY;

  for (const page of /** @type {TabPage[]} */ (Object.keys(BELONGS))) {
    if (page === current) {
      if (generatedAt) seen[page] = generatedAt;
      continue;
    }
    const since = seen[page] ? Date.parse(seen[page]) : firstVisit;
    const hasNew = offers.some((offer) => BELONGS[page](offer, now) && Date.parse(offer.firstSeen) > since);
    if (hasNew) addBadge(page);
  }
  saveSeen(seen);
}

/** @param {TabPage} page */
function addBadge(page) {
  const tab = document.querySelector(`.tabs a[href="${TAB_HREFS[page]}"]`);
  if (!tab || tab.querySelector('.tab-new')) return;
  const badge = el('span', 'tab-new');
  badge.append(el('span', '', 'NEW'));
  badge.firstElementChild?.setAttribute('aria-hidden', 'true');
  badge.append(el('span', 'sr-only', ' (nouveautés)'));
  tab.append(badge);
}

/**
 * Valeur stockée illisible ou stockage indisponible : aucune page vue.
 * @returns {Partial<Record<TabPage, string>>}
 */
function loadSeen() {
  /** @type {any} */
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return {};
  }
  if (!stored || typeof stored !== 'object') return {};
  /** @type {Partial<Record<TabPage, string>>} */
  const seen = {};
  for (const page of /** @type {TabPage[]} */ (Object.keys(BELONGS))) {
    const value = stored[page];
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) seen[page] = value;
  }
  return seen;
}

/** @param {Partial<Record<TabPage, string>>} seen */
function saveSeen(seen) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // stockage indisponible : les badges reviendront à chaque visite
  }
}
