import { createSortMenu } from './sortMenu.js';
import { offerStatus } from './status.js';

/** @typedef {import('../../collector/offer.ts').Offer} Offer */
/** @typedef {import('../../collector/offer.ts').Store} Store */
/** @typedef {import('./status.js').OfferStatus} OfferStatus */
/** @typedef {{ store: string, types: string[], content: string[], status: string[], sort: Record<Store, string> }} Filters */
/** @typedef {{ section: HTMLElement, list: HTMLUListElement, empty: HTMLElement, sort: import('./sortMenu.js').SortMenu }} StoreSection */

// Préfixe localStorage du projet dans l'organisation : « fl- ».
const STORAGE_KEY = 'fl-filters';

/** Magasins dans l'ordre d'affichage. @type {Store[]} */
const STORES = ['steam', 'epic'];
const STORE_LABELS = { steam: 'Steam', epic: 'Epic Games Store' };
const TYPE_LABELS = { free_to_keep: 'À garder', free_weekend: 'Week-end gratuit', now_free: 'Devenu gratuit' };
const SORT_LABELS = { ending: 'Fin la plus proche', value: 'Valeur la plus haute', recent: 'Ajout le plus récent', name: 'Nom' };
const STATUS_RANK = { active: 0, upcoming: 1, expired: 2 };

/** @returns {Filters} */
const defaultFilters = () => ({
  store: '',
  types: Object.keys(TYPE_LABELS),
  content: ['game', 'dlc'],
  status: ['active', 'upcoming'],
  sort: { steam: 'ending', epic: 'ending' },
});

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** Part du temps restant sous laquelle la barre passe à l'orange, puis au rouge. */
const LEVEL_MID = 0.5;
const LEVEL_LOW = 0.2;

const TIME_ZONE = 'Europe/Paris';
const dayFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' });
const dayYearFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const longDayFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, day: 'numeric', month: 'long' });
const timeFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const yearFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, year: 'numeric' });
const isoDayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

const form = /** @type {HTMLFormElement} */ (document.getElementById('filters'));
const message = /** @type {HTMLElement} */ (document.getElementById('message'));
const updated = /** @type {HTMLElement} */ (document.getElementById('updated'));

/** @type {Record<Store, StoreSection>} */
const sections = /** @type {Record<Store, StoreSection>} */ (
  Object.fromEntries(
    STORES.map((store) => {
      const section = /** @type {HTMLElement} */ (document.querySelector(`.store[data-store="${store}"]`));
      const sort = createSortMenu(/** @type {HTMLElement} */ (section.querySelector('.sort')), {
        label: `Trier les offres ${STORE_LABELS[store]}`,
        options: SORT_LABELS,
        value: 'ending',
        onChange,
      });
      return [
        store,
        {
          section,
          list: /** @type {HTMLUListElement} */ (section.querySelector('.grid')),
          empty: /** @type {HTMLElement} */ (section.querySelector('.empty')),
          sort,
        },
      ];
    }),
  )
);

/** @type {Offer[]} */
let offers = [];
/** @type {number[]} */
let historyYears = [];
let historyLoaded = false;

init();

async function init() {
  applyFilters(loadFilters());
  form.addEventListener('change', onChange);
  message.textContent = 'Chargement des offres…';

  try {
    const response = await fetch('data/offers.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    offers = data.offers;
    historyYears = data.historyYears ?? [];
    updated.textContent = data.generatedAt ? `Mis à jour ${relativeDay(new Date(data.generatedAt))}` : 'Date de mise à jour inconnue';
    message.textContent = '';
  } catch {
    updated.textContent = 'Données indisponibles';
    updated.classList.add('is-error');
    message.textContent = 'Impossible de charger les offres.';
    return;
  }

  await onChange();
  setInterval(tick, 1000);
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
      filters.types.includes(offer.type) &&
      filters.content.includes(offer.isDlc ? 'dlc' : 'game') &&
      filters.status.includes(status),
    );

  for (const store of STORES) {
    const { section, list, empty } = sections[store];
    section.hidden = filters.store !== '' && filters.store !== store;
    const items = visible.filter(({ offer }) => offer.store === store).sort(comparator(filters.sort[store]));
    list.replaceChildren(...items.map(({ offer, status }) => card(offer, status, now)));
    empty.hidden = items.length > 0;
  }
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

  const cover = el('div', 'cover');
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
  const pills = el('div', 'pills');
  pills.append(el('span', 'pill', TYPE_LABELS[offer.type]));
  if (offer.isDlc) pills.append(el('span', 'pill', 'DLC'));
  cover.append(pills);

  const body = el('div', 'card-body');

  // Le lien du titre couvre toute la carte (voir style.css).
  const title = el('h3');
  const titleLink = /** @type {HTMLAnchorElement} */ (el('a', '', offer.title));
  linkTo(titleLink, url);
  titleLink.setAttribute('aria-label', `${offer.title} sur ${STORE_LABELS[offer.store]}`);
  title.append(titleLink);
  body.append(title);

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
  price.append(el('strong', '', offer.type === 'free_weekend' ? 'Gratuit à jouer' : 'Gratuit'));
  body.append(price);

  const discount = discountText(offer, status, now);
  if (discount) body.append(el('p', 'discount', discount));

  body.append(dateLine(offer, status));
  body.append(countdown(offer, status, now));

  item.append(cover, body);
  return item;
}

/**
 * Date de l'échéance qui compte : début pour une offre à venir, fin sinon.
 * @param {Offer} offer
 * @param {OfferStatus} status
 */
function dateLine(offer, status) {
  const line = el('p', 'date');
  line.append(icon('icon-calendar'));
  /** @param {string} prefix @param {string} iso */
  const withDate = (prefix, iso) => {
    const time = /** @type {HTMLTimeElement} */ (el('time', '', formatDate(new Date(iso))));
    time.dateTime = iso;
    line.append(prefix, time);
  };
  if (status === 'upcoming' && offer.startDate) withDate('Dès le ', offer.startDate);
  else if (status === 'expired' && offer.endDate) withDate('Terminée le ', offer.endDate);
  else if (offer.endDate) withDate('Jusqu’au ', offer.endDate);
  else line.append('Sans date de fin connue');
  return line;
}

/**
 * Compte à rebours et barre du temps restant ; rien de dynamique pour une offre terminée ou sans fin.
 * @param {Offer} offer
 * @param {OfferStatus} status
 * @param {number} now
 */
function countdown(offer, status, now) {
  const state = countdownState(offer, status, now);
  if (!state) return el('p', 'ended', status === 'expired' ? 'Offre terminée' : 'En cours');

  const box = el('div', `countdown ${state.level}`);
  box.append(el('p', 'countdown-label', state.label));

  const timer = el('div', 'timer');
  timer.setAttribute('role', 'timer');
  for (const unit of ['j', 'h', 'min', 's']) {
    const cell = el('span');
    cell.append(el('b'), el('small', '', unit));
    timer.append(cell);
  }
  setTimer(timer, state.remaining);

  const bar = el('div', 'bar');
  bar.setAttribute('aria-hidden', 'true');
  const fill = el('span', 'bar-fill');
  fill.style.width = `${state.ratio * 100}%`;
  bar.append(fill);

  box.append(timer, bar);
  return box;
}

/**
 * @param {Offer} offer
 * @param {OfferStatus} status
 * @param {number} now
 * @returns {{ remaining: number, ratio: number, level: string, label: string } | null}
 */
function countdownState(offer, status, now) {
  if (status === 'upcoming' && offer.startDate) {
    return { remaining: Date.parse(offer.startDate) - now, ratio: 1, level: 'level-upcoming', label: 'Commence dans' };
  }
  if (status !== 'active' || !offer.endDate) return null;
  const end = Date.parse(offer.endDate);
  const start = Date.parse(offer.startDate ?? offer.firstSeen);
  const remaining = end - now;
  const ratio = end > start ? Math.min(1, Math.max(0, remaining / (end - start))) : 0;
  const level = ratio > LEVEL_MID ? 'level-high' : ratio > LEVEL_LOW ? 'level-mid' : 'level-low';
  return { remaining, ratio, level, label: remaining < 24 * HOUR ? 'Dernières heures' : 'Se termine dans' };
}

/**
 * @param {HTMLElement} timer
 * @param {number} ms
 */
function setTimer(timer, ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const values = [
    String(Math.floor(total / 86_400)),
    pad(Math.floor(total / 3600) % 24),
    pad(Math.floor(total / 60) % 60),
    pad(total % 60),
  ];
  timer.querySelectorAll('b').forEach((cell, index) => {
    const value = values[index] ?? '';
    if (cell.textContent !== value) cell.textContent = value;
  });
}

/** @param {number} value */
function pad(value) {
  return String(value).padStart(2, '0');
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
  const end = discount.endDate ? ` jusqu’au ${dayFormat.format(new Date(discount.endDate))}` : '';
  return `En promotion à ${formatMoney(discount.price, offer.currency)} (-${discount.percent} %)${end}`;
}

/**
 * @param {number} cents
 * @param {string} currency
 */
function formatMoney(cents, currency) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
}

/** « mer. 18 nov. 21 h 43 », avec l'année si ce n'est pas l'année en cours. @param {Date} date */
function formatDate(date) {
  const sameYear = yearFormat.format(date) === yearFormat.format(new Date());
  return `${(sameYear ? dayFormat : dayYearFormat).format(date)} ${formatTime(date)}`;
}

/** « 21 h 43 ». @param {Date} date */
function formatTime(date) {
  const [hour, minute] = timeFormat.format(date).split(':');
  return `${Number(hour)} h ${minute}`;
}

/** « aujourd'hui à 14 h 49 », « hier à … » ou « le 12 novembre à … ». @param {Date} date */
function relativeDay(date) {
  const day = isoDayFormat.format(date);
  const now = Date.now();
  if (day === isoDayFormat.format(now)) return `aujourd’hui à ${formatTime(date)}`;
  if (day === isoDayFormat.format(now - DAY)) return `hier à ${formatTime(date)}`;
  return `le ${longDayFormat.format(date)} à ${formatTime(date)}`;
}

/** Chaque seconde : comptes à rebours et barres ; re-rend la liste si une offre change de statut. */
function tick() {
  const now = Date.now();
  const byId = new Map(offers.map((offer) => [offer.id, offer]));
  for (const node of document.querySelectorAll('.card')) {
    const offer = byId.get(/** @type {HTMLElement} */ (node).dataset.id ?? '');
    if (!offer) continue;
    const status = offerStatus(offer, now);
    if (!node.classList.contains(`is-${status}`)) {
      render(readFilters());
      return;
    }
    const box = /** @type {HTMLElement | null} */ (node.querySelector('.countdown'));
    const state = countdownState(offer, status, now);
    if (box && state) {
      box.className = `countdown ${state.level}`;
      const label = /** @type {HTMLElement} */ (box.querySelector('.countdown-label'));
      if (label.textContent !== state.label) label.textContent = state.label;
      setTimer(/** @type {HTMLElement} */ (box.querySelector('.timer')), state.remaining);
      /** @type {HTMLElement} */ (box.querySelector('.bar-fill')).style.width = `${state.ratio * 100}%`;
    }
    // Remise terminée pendant que la page est ouverte.
    if (!discountText(offer, status, now)) node.querySelector('.discount')?.remove();
  }
}

/** @param {string} id */
function icon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
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
    types: data.getAll('type').map(String),
    content: data.getAll('content').map(String),
    status: data.getAll('status').map(String),
    sort: { steam: sections.steam.sort.get(), epic: sections.epic.sort.get() },
  };
}

/** @param {Filters} filters */
function applyFilters(filters) {
  for (const input of form.querySelectorAll('input')) {
    const box = /** @type {HTMLInputElement} */ (input);
    if (box.name === 'store') box.checked = box.value === filters.store;
    else if (box.name === 'type') box.checked = filters.types.includes(box.value);
    else if (box.name === 'content') box.checked = filters.content.includes(box.value);
    else if (box.name === 'status') box.checked = filters.status.includes(box.value);
  }
  for (const store of STORES) sections[store].sort.set(filters.sort[store]);
}

/**
 * Valeur stockée illisible, d'un ancien format ou stockage indisponible : on garde ce qui est valide,
 * le reste prend la valeur par défaut.
 * @returns {Filters}
 */
function loadFilters() {
  const filters = defaultFilters();
  /** @type {any} */
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return filters;
  }
  if (!stored || typeof stored !== 'object') return filters;

  /** @param {unknown} value @param {string[]} allowed */
  const list = (value, allowed) =>
    Array.isArray(value) ? value.filter((item) => allowed.includes(item)) : null;

  if (['', ...STORES].includes(stored.store)) filters.store = stored.store;
  filters.types = list(stored.types, Object.keys(TYPE_LABELS)) ?? filters.types;
  filters.content = list(stored.content, ['game', 'dlc']) ?? filters.content;
  filters.status = list(stored.status, Object.keys(STATUS_RANK)) ?? filters.status;
  for (const store of STORES) {
    // Ancien format : un seul tri pour toute la page.
    const sort = typeof stored.sort === 'object' && stored.sort ? stored.sort[store] : stored.sort;
    if (Object.hasOwn(SORT_LABELS, sort)) filters.sort[store] = sort;
  }
  return filters;
}

/** @param {Filters} filters */
function saveFilters(filters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // stockage indisponible : sans conséquence
  }
}
