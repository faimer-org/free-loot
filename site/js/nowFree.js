// Page Devenus gratuits : jeux devenus gratuits sans date de fin, encore gratuits.
// Redevenu payant, un jeu passe dans les archives.

import { initCatalog, yearOf, yearOptions } from './catalog.js';
import { el, icon, TIME_ZONE } from './common.js';
import { offerStatus } from './status.js';

/** @typedef {import('../../collector/offer.ts').Offer} Offer */

const dayYearFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' });
const monthYearFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, month: 'short', year: 'numeric' });
const isoMonthFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit' });

/** Date de détection, proche du passage à la gratuité (relevé deux fois par jour). @param {Offer} offer */
const detectedOn = (offer) => offer.firstSeen;

/** Fenêtres glissantes, en mois. @type {Record<string, number>} */
const WINDOWS = { '6m': 6, '12m': 12 };

initCatalog({
  load: loadNowFree,
  dateOf: detectedOn,
  types: ['now_free'],
  // Pas de tri par valeur : le prix d'un jeu devenu gratuit n'est plus affiché par Steam.
  sortLabels: { recent: 'Plus récents', oldest: 'Plus anciens', name: 'Nom' },
  sortLabel: 'Trier les jeux devenus gratuits',
  period: {
    label: 'Devenus gratuits',
    param: 'periode',
    defaultKey: '6m',
    options: (offers) => ({
      '6m': '6 derniers mois',
      '12m': '12 derniers mois',
      ...yearOptions(offers, detectedOn),
      tout: 'Depuis le début',
    }),
    matches: (offer, key) => {
      const months = WINDOWS[key];
      if (months !== undefined) return Date.parse(detectedOn(offer)) >= monthsAgo(months);
      return key === 'tout' || `y${yearOf(detectedOn(offer))}` === key;
    },
  },
  cardClass: 'card archive-card now-free-card',
  cardLines: (offer) => [sinceLine(offer), freeLine()],
  renderStats,
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
  const now = Date.now();
  return (Array.isArray(data.offers) ? data.offers : []).filter(
    (/** @type {Offer} */ offer) => offer.type === 'now_free' && offerStatus(offer, now) !== 'expired',
  );
}

/** Début de la fenêtre des `months` derniers mois, en millisecondes. @param {number} months */
function monthsAgo(months) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.getTime();
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

/** @param {Offer[]} matches @param {Offer[]} all @param {boolean} isDefault */
function renderStats(matches, all, isDefault) {
  /** @type {HTMLElement} */ (document.getElementById('stat-count')).textContent = String(matches.length);
  /** @type {HTMLElement} */ (document.getElementById('stat-count-label')).textContent = isDefault
    ? 'Jeux, 6 derniers mois'
    : 'Jeux trouvés';
  const month = isoMonthFormat.format(new Date());
  /** @type {HTMLElement} */ (document.getElementById('stat-month')).textContent = String(
    all.filter((offer) => isoMonthFormat.format(new Date(detectedOn(offer))) === month).length,
  );
  const oldest = all.reduce((min, offer) => Math.min(min, Date.parse(detectedOn(offer)) || min), Infinity);
  /** @type {HTMLElement} */ (document.getElementById('stat-since')).textContent = Number.isFinite(oldest)
    ? monthYearFormat.format(oldest)
    : '—';
}
