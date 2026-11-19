// Page Devenus gratuits : jeux devenus gratuits sans date de fin, encore gratuits.
// Redevenu payant, un jeu passe dans les archives.

import { initCatalog } from './catalog.js';
import { el, icon, TIME_ZONE } from './common.js';
import { isNowFreeOffer, markTabs } from './tabs.js';

/** @typedef {import('../../collector/offer.ts').Offer} Offer */

const dayYearFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' });

/** Date de détection, proche du passage à la gratuité (relevé deux fois par jour). @param {Offer} offer */
const detectedOn = (offer) => offer.firstSeen;

initCatalog({
  load: loadNowFree,
  dateOf: detectedOn,
  types: ['now_free'],
  // Pas de tri par valeur : le prix d'un jeu devenu gratuit n'est plus affiché par Steam.
  sortLabels: { recent: 'Plus récents', oldest: 'Plus anciens', name: 'Nom' },
  sortLabel: 'Trier les jeux devenus gratuits',
  periodLabel: 'Devenus gratuits',
  cardClass: 'card archive-card now-free-card',
  cardLines: (offer) => [sinceLine(offer), freeLine()],
  noun: { one: 'jeu', many: 'jeux' },
  messages: {
    empty: 'Aucun jeu devenu gratuit pour l’instant : ils apparaîtront ici dès qu’ils seront repérés.',
    error: 'Impossible de charger les jeux devenus gratuits.',
  },
});

/** @returns {Promise<Offer[]>} */
async function loadNowFree() {
  const response = await fetch('data/offers.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  markTabs(data, 'nowFree');
  const now = Date.now();
  return (Array.isArray(data.offers) ? data.offers : []).filter((/** @type {Offer} */ offer) => isNowFreeOffer(offer, now));
}

/** « Gratuit depuis le 14 nov. 2026 ». @param {Offer} offer */
function sinceLine(offer) {
  const line = el('p', 'date');
  line.append(icon('icon-calendar'), 'Depuis le ');
  const time = /** @type {HTMLTimeElement} */ (el('time', '', dayYearFormat.format(new Date(offer.firstSeen))));
  time.dateTime = offer.firstSeen;
  line.append(time);
  return line;
}

function freeLine() {
  const line = el('p', 'archive-price');
  line.append(el('strong', '', 'Gratuit'), el('span', '', ' · définitif'));
  return line;
}
