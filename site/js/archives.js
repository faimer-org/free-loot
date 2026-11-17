// Page Archives : offres terminées (offers.json et historique annuel).

import { initCatalog } from './catalog.js';
import { el, formatMoney, icon, TIME_ZONE, TYPE_LABELS } from './common.js';
import { offerStatus } from './status.js';

/** @typedef {import('../../collector/offer.ts').Offer} Offer */

const dayFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' });
const dayYearFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' });
const yearFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, year: 'numeric' });

/** Date de fin : tri, période et mois. @param {Offer} offer */
const endOf = (offer) => offer.endDate;

initCatalog({
  load: loadArchived,
  dateOf: endOf,
  types: Object.keys(TYPE_LABELS),
  sortLabels: { recent: 'Plus récentes', oldest: 'Plus anciennes', value: 'Valeur la plus haute', name: 'Nom' },
  sortLabel: 'Trier les archives',
  periodLabel: 'Fin de l’offre',
  cardClass: 'card archive-card',
  cardLines: (offer) => [dateRange(offer), priceLine(offer)],
  noun: { one: 'offre', many: 'offres' },
  messages: {
    empty: 'Aucune offre archivée pour l’instant : les offres terminées apparaîtront ici.',
    error: 'Impossible de charger les archives.',
  },
});

/** Offres terminées : celles d'offers.json (moins de 30 jours) et tout l'historique. @returns {Promise<Offer[]>} */
async function loadArchived() {
  const response = await fetch('data/offers.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const now = Date.now();
  /** @type {Offer[]} */
  const recent = (Array.isArray(data.offers) ? data.offers : []).filter(
    (/** @type {Offer} */ offer) => offerStatus(offer, now) === 'expired',
  );
  const years = Array.isArray(data.historyYears) ? data.historyYears.filter(Number.isInteger) : [];
  const files = await Promise.all(
    years.map((/** @type {number} */ year) =>
      fetch(`data/history/${year}.json`)
        .then((res) => (res.ok ? res.json() : { offers: [] }))
        .catch(() => ({ offers: [] })),
    ),
  );
  const byId = new Map(recent.map((offer) => [offer.id, offer]));
  for (const file of files) {
    for (const offer of Array.isArray(file.offers) ? file.offers : []) {
      if (offer?.id && offer.endDate && !byId.has(offer.id)) byId.set(offer.id, offer);
    }
  }
  return [...byId.values()];
}

/** « 12 nov. → 19 nov. 2026 ». @param {Offer} offer */
function dateRange(offer) {
  const line = el('p', 'date');
  line.append(icon('icon-calendar'));
  const end = new Date(offer.endDate ?? 0);
  const startIso = offer.startDate ?? offer.firstSeen;
  const start = new Date(startIso);
  const sameYear = yearFormat.format(start) === yearFormat.format(end);
  const startTime = /** @type {HTMLTimeElement} */ (el('time', '', (sameYear ? dayFormat : dayYearFormat).format(start)));
  startTime.dateTime = startIso;
  const endTime = /** @type {HTMLTimeElement} */ (el('time', '', dayYearFormat.format(end)));
  endTime.dateTime = offer.endDate ?? '';
  line.append(startTime, ' → ', endTime);
  return line;
}

/** @param {Offer} offer */
function priceLine(offer) {
  const price = el('p', 'archive-price');
  if (offer.originalPrice !== null && offer.currency) {
    price.append(el('span', '', 'Prix d’origine '), formatMoney(offer.originalPrice, offer.currency));
  } else {
    price.append(el('span', '', 'Prix d’origine inconnu'));
  }
  return price;
}
