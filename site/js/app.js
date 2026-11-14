import { offerStatus } from './status.js';

/** @typedef {import('../../collector/offer.ts').Offer} Offer */
/** @typedef {import('./status.js').OfferStatus} OfferStatus */
/** @typedef {{ store: string, type: string, dlc: string, status: string[], sort: string }} Filters */

// Préfixe localStorage du projet dans l'organisation : « fl- ».
const STORAGE_KEY = 'fl-filters';
const DEFAULT_FILTERS = /** @type {Filters} */ ({ store: '', type: '', dlc: '', status: ['active', 'upcoming'], sort: 'ending' });

const STORE_LABELS = { steam: 'Steam', epic: 'Epic Games Store' };
const TYPE_LABELS = { free_to_keep: 'Free to Keep', free_weekend: 'Free Weekend', now_free: 'Devenu gratuit' };
const STATUS_RANK = { active: 0, upcoming: 1, expired: 2 };

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const fullDateFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' });

const form = /** @type {HTMLFormElement} */ (document.getElementById('filters'));
const list = /** @type {HTMLUListElement} */ (document.getElementById('offers'));
const count = /** @type {HTMLElement} */ (document.getElementById('count'));
const updated = /** @type {HTMLElement} */ (document.getElementById('updated'));

/** @type {Offer[]} */
let offers = [];
/** @type {number[]} */
let historyYears = [];
let historyLoaded = false;

init();

async function init() {
  applyFilters(loadFilters());
  form.addEventListener('change', onChange);

  try {
    const response = await fetch('data/offers.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    offers = data.offers;
    historyYears = data.historyYears ?? [];
    updated.textContent = data.generatedAt ? `mis à jour le ${fullDateFormat.format(new Date(data.generatedAt))}` : '';
  } catch {
    updated.textContent = 'données indisponibles';
    count.textContent = 'Impossible de charger les offres.';
    return;
  }

  await onChange();
  setInterval(refreshCountdowns, 60_000);
}

async function onChange() {
  const filters = readFilters();
  saveFilters(filters);
  if (filters.status.includes('expired')) await loadHistory();
  render(filters);
}

/** L'historique (offres expirées depuis plus de 30 jours) n'est chargé que si on affiche les expirées. */
async function loadHistory() {
  if (historyLoaded) return;
  historyLoaded = true;
  const files = await Promise.all(
    historyYears.map((year) =>
      fetch(`data/history/${year}.json`)
        .then((response) => (response.ok ? response.json() : { offers: [] }))
        .catch(() => ({ offers: [] })),
    ),
  );
  const known = new Set(offers.map((offer) => offer.id));
  for (const file of files) {
    offers.push(...file.offers.filter((/** @type {Offer} */ offer) => !known.has(offer.id)));
  }
}

/** @param {Filters} filters */
function render(filters) {
  const now = Date.now();
  const visible = offers
    .map((offer) => ({ offer, status: offerStatus(offer, now) }))
    .filter(({ offer, status }) =>
      (!filters.store || offer.store === filters.store) &&
      (!filters.type || offer.type === filters.type) &&
      (!filters.dlc || offer.isDlc === (filters.dlc === 'dlc')) &&
      filters.status.includes(status),
    )
    .sort(comparator(filters.sort));

  list.replaceChildren(...visible.map(({ offer, status }) => card(offer, status, now)));
  count.textContent =
    visible.length === 0 ? 'Aucune offre ne correspond aux filtres.' : `${visible.length} offre${visible.length > 1 ? 's' : ''}`;
}

/**
 * @param {string} sort
 * @returns {(a: { offer: Offer, status: OfferStatus }, b: { offer: Offer, status: OfferStatus }) => number}
 */
function comparator(sort) {
  const time = (/** @type {string | null} */ iso, /** @type {number} */ fallback) => (iso ? Date.parse(iso) : fallback);
  switch (sort) {
    case 'value':
      return (a, b) => (b.offer.originalPrice ?? -1) - (a.offer.originalPrice ?? -1);
    case 'recent':
      return (a, b) => time(b.offer.firstSeen, 0) - time(a.offer.firstSeen, 0);
    case 'name':
      return (a, b) => a.offer.title.localeCompare(b.offer.title, 'fr', { sensitivity: 'base' });
    default:
      // Fin la plus proche : en cours, puis à venir, puis expirées (les plus récentes d'abord).
      return (a, b) => {
        const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        if (rank !== 0) return rank;
        const diff = time(a.offer.endDate, Infinity) - time(b.offer.endDate, Infinity);
        return a.status === 'expired' ? -diff : diff;
      };
  }
}

/**
 * @param {Offer} offer
 * @param {OfferStatus} status
 * @param {number} now
 */
function card(offer, status, now) {
  const url = safeUrl(offer.url);
  const item = el('li', `card is-${status}`);
  item.dataset.id = offer.id;

  // Jaquette cliquable vers la page du magasin.
  const cover = /** @type {HTMLAnchorElement} */ (el('a', 'cover'));
  linkTo(cover, url);
  cover.setAttribute('aria-label', `${offer.title} sur ${STORE_LABELS[offer.store]}`);
  const image = safeUrl(offer.image);
  if (image) {
    const img = /** @type {HTMLImageElement} */ (el('img'));
    img.src = image;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('load', () => img.classList.toggle('is-wide', img.naturalWidth > img.naturalHeight));
    img.addEventListener('error', () => img.replaceWith(el('span', 'cover-fallback', offer.title)));
    cover.append(img);
  } else {
    cover.append(el('span', 'cover-fallback', offer.title));
  }

  const body = el('div', 'card-body');
  const badges = el('div', 'badges');
  badges.append(
    el('span', `badge store-${offer.store}`, STORE_LABELS[offer.store]),
    el('span', 'badge', TYPE_LABELS[offer.type]),
  );
  if (offer.isDlc) badges.append(el('span', 'badge', 'DLC'));

  const title = el('h2');
  const titleLink = /** @type {HTMLAnchorElement} */ (el('a', '', offer.title));
  linkTo(titleLink, url);
  title.append(titleLink);
  body.append(badges, title);

  if (offer.isDlc) {
    const base = el('p', 'base-game', 'Nécessite : ');
    const baseUrl = safeUrl(offer.baseGame?.url ?? null);
    if (offer.baseGame && baseUrl) {
      const link = /** @type {HTMLAnchorElement} */ (el('a', '', offer.baseGame.title));
      linkTo(link, baseUrl);
      base.append(link);
    } else {
      base.append(offer.baseGame?.title ?? 'le jeu de base');
    }
    body.append(base);
  }

  const price = el('p', 'price');
  if (offer.originalPrice !== null && offer.currency) {
    price.append(el('s', '', formatMoney(offer.originalPrice, offer.currency)));
  }
  price.append(offer.type === 'free_weekend' ? 'Gratuit à jouer' : 'Gratuit');
  body.append(price);
  const discount = discountText(offer, status, now);
  if (discount) body.append(el('p', 'discount', discount));
  body.append(el('p', 'dates', datesText(offer)));

  const countdown = el('p', `countdown status-${status}`, countdownText(offer, status, now));
  body.append(countdown);

  item.append(cover, body);
  return item;
}

/**
 * Remise payante en cours pendant un Free Weekend ; chaîne vide s'il n'y en a pas.
 * Les offres enregistrées avant l'ajout du champ `discount` (offers.json, historique) n'en ont pas.
 * @param {Offer} offer
 * @param {OfferStatus} status
 * @param {number} now
 */
function discountText(offer, status, now) {
  const discount = offer.discount;
  if (!discount || typeof discount.price !== 'number' || !offer.currency || status === 'expired') return '';
  if (discount.endDate && Date.parse(discount.endDate) <= now) return '';
  const end = discount.endDate ? ` jusqu'au ${dateFormat.format(new Date(discount.endDate))}` : '';
  return `En promotion à ${formatMoney(discount.price, offer.currency)} (-${discount.percent}\u00a0%)${end}`;
}

/**
 * @param {number} cents
 * @param {string} currency
 */
function formatMoney(cents, currency) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
}

/** @param {Offer} offer */
function datesText(offer) {
  const start = offer.startDate
    ? `Du ${dateFormat.format(new Date(offer.startDate))}`
    : `Repérée le ${dateFormat.format(new Date(offer.firstSeen))}`;
  const end = offer.endDate ? ` au ${dateFormat.format(new Date(offer.endDate))}` : ', sans date de fin';
  return start + end;
}

/**
 * @param {Offer} offer
 * @param {OfferStatus} status
 * @param {number} now
 */
function countdownText(offer, status, now) {
  if (status === 'upcoming' && offer.startDate) return `Commence dans ${duration(Date.parse(offer.startDate) - now)}`;
  if (status === 'expired' && offer.endDate) return `Terminée le ${dateFormat.format(new Date(offer.endDate))}`;
  if (offer.endDate) return `Se termine dans ${duration(Date.parse(offer.endDate) - now)}`;
  return 'En cours, sans date de fin connue';
}

/** @param {number} ms */
function duration(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days} j ${hours} h`;
  if (hours > 0) return `${hours} h ${mins} min`;
  return `${mins} min`;
}

/** Met à jour les comptes à rebours ; re-rend la liste si une offre change de statut. */
function refreshCountdowns() {
  const now = Date.now();
  const byId = new Map(offers.map((offer) => [offer.id, offer]));
  for (const node of list.querySelectorAll('.card')) {
    const offer = byId.get(/** @type {HTMLElement} */ (node).dataset.id ?? '');
    if (!offer) continue;
    const status = offerStatus(offer, now);
    if (!node.classList.contains(`is-${status}`)) {
      render(readFilters());
      return;
    }
    const countdown = node.querySelector('.countdown');
    if (countdown) countdown.textContent = countdownText(offer, status, now);
    // Remise terminée pendant que la page est ouverte.
    if (!discountText(offer, status, now)) node.querySelector('.discount')?.remove();
  }
}

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 */
function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * @param {HTMLAnchorElement} anchor
 * @param {string | null} url
 */
function linkTo(anchor, url) {
  if (!url) return;
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
}

/** Seules les URL https sont affichées. @param {string | null} url */
function safeUrl(url) {
  return url && url.startsWith('https://') ? url : null;
}

/** @returns {Filters} */
function readFilters() {
  const data = new FormData(form);
  return {
    store: String(data.get('store') ?? ''),
    type: String(data.get('type') ?? ''),
    dlc: String(data.get('dlc') ?? ''),
    status: data.getAll('status').map(String),
    sort: String(data.get('sort') ?? 'ending'),
  };
}

/** @param {Filters} filters */
function applyFilters(filters) {
  for (const name of /** @type {const} */ (['store', 'type', 'dlc', 'sort'])) {
    const select = /** @type {HTMLSelectElement} */ (form.elements.namedItem(name));
    if ([...select.options].some((option) => option.value === filters[name])) select.value = filters[name];
  }
  for (const box of form.querySelectorAll('input[name="status"]')) {
    const input = /** @type {HTMLInputElement} */ (box);
    input.checked = filters.status.includes(input.value);
  }
}

/** Valeur stockée illisible ou stockage indisponible : filtres par défaut. @returns {Filters} */
function loadFilters() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (stored && typeof stored === 'object' && Array.isArray(stored.status)) {
      return { ...DEFAULT_FILTERS, ...stored };
    }
  } catch {
    // ignoré
  }
  return DEFAULT_FILTERS;
}

/** @param {Filters} filters */
function saveFilters(filters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // stockage indisponible : sans conséquence
  }
}
