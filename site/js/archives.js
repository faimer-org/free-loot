// Page Archives : offres terminées (offers.json et historique annuel), avec recherche, filtres et pagination.
// L'état des filtres est dans l'adresse de la page, pour pouvoir la partager ou y revenir.

import {
  baseGameElement,
  CONTENT_LABELS,
  coverElement,
  el,
  formatMoney,
  icon,
  offerTags,
  STORE_LABELS,
  STORES,
  tagsElement,
  TIME_ZONE,
  titleElement,
  TYPE_LABELS,
} from './common.js';
import { initPreview } from './preview.js';
import { createSortMenu } from './sortMenu.js';
import { offerStatus } from './status.js';

/** @typedef {import('../../collector/offer.ts').Offer} Offer */
/**
 * @typedef {object} State
 * @property {string} q
 * @property {string[]} stores
 * @property {string[]} types
 * @property {string[]} content
 * @property {string[]} tags
 * @property {string} year « all » ou « y2026 »
 * @property {string} sort
 * @property {number} page
 */

const PAGE_SIZE = 24;
/** Catégories proposées : les tags les plus fréquents des archives. */
const TAG_CHIPS = 12;
const CARD_TAGS = 2;
const SEARCH_DELAY = 150;

const SORT_LABELS = { recent: 'Plus récentes', oldest: 'Plus anciennes', value: 'Valeur la plus haute', name: 'Nom' };
const TYPES = Object.keys(TYPE_LABELS);
const CONTENT = Object.keys(CONTENT_LABELS);

const dayFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' });
const dayYearFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' });
const monthYearFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, month: 'short', year: 'numeric' });
const yearFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, year: 'numeric' });

const form = /** @type {HTMLFormElement} */ (document.getElementById('filters'));
const searchInput = /** @type {HTMLInputElement} */ (form.elements.namedItem('q'));
const tagChips = /** @type {HTMLFieldSetElement} */ (document.getElementById('tag-chips'));
const results = /** @type {HTMLUListElement} */ (document.getElementById('results'));
const message = /** @type {HTMLElement} */ (document.getElementById('message'));
const resetButton = /** @type {HTMLButtonElement} */ (document.getElementById('reset'));
const pagination = /** @type {HTMLElement} */ (document.getElementById('pagination'));
const stats = /** @type {HTMLElement} */ (document.getElementById('stats'));

/** @type {Offer[]} */
let archived = [];
/** @type {State} */
let state = defaultState();

/** Construit une fois les années connues (buildYearMenu). @type {import('./sortMenu.js').SortMenu | null} */
let yearMenu = null;
const sortMenu = createSortMenu(/** @type {HTMLElement} */ (document.getElementById('sort-menu')), {
  label: 'Trier les archives',
  options: SORT_LABELS,
  value: 'recent',
  onChange: (sort) => update({ sort }),
});

const preview = initPreview(/** @type {HTMLElement} */ (document.querySelector('main')), (id) =>
  archived.find((offer) => offer.id === id),
);

init();

async function init() {
  try {
    archived = await loadArchived();
  } catch {
    message.textContent = 'Impossible de charger les archives.';
    return;
  }
  if (archived.length === 0) {
    message.textContent = 'Aucune offre archivée pour l’instant : les offres terminées apparaîtront ici.';
    return;
  }

  buildYearMenu();
  buildTagChips();
  state = readUrl();
  applyState();
  form.hidden = false;
  stats.hidden = false;

  form.addEventListener('change', (event) => {
    if (event.target === searchInput) return;
    update(readForm());
  });
  let searchTimer = 0;
  searchInput.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => update({ q: searchInput.value }), SEARCH_DELAY);
  });
  form.addEventListener('submit', (event) => event.preventDefault());
  resetButton.addEventListener('click', () => {
    state = defaultState();
    applyState();
    render();
  });
  pagination.addEventListener('click', (event) => {
    const button = /** @type {HTMLElement} */ (event.target).closest('button[data-page]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;
    update({ page: Number(button.dataset.page) }, false);
    document.querySelector('.results-head')?.scrollIntoView({ block: 'start' });
  });

  render();
}

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

/** @param {Partial<State>} changes @param {boolean} [resetPage] */
function update(changes, resetPage = true) {
  state = { ...state, ...changes, ...(resetPage ? { page: 1 } : {}) };
  render();
}

function render() {
  preview.hide();
  const matches = archived.filter(matchesState).sort(comparator(state.sort));
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), pages);
  const first = (state.page - 1) * PAGE_SIZE;
  const shown = matches.slice(first, first + PAGE_SIZE);

  results.replaceChildren(...shown.map(card));
  message.textContent =
    matches.length === 0
      ? 'Aucune offre ne correspond à ces filtres.'
      : `${first + 1}–${first + shown.length} sur ${matches.length} offre${matches.length > 1 ? 's' : ''}`;
  resetButton.hidden = isDefault(state);
  renderPagination(pages);
  renderStats(matches);
  writeUrl();
}

/** @param {Offer} offer */
function matchesState(offer) {
  if (!state.stores.includes(offer.store)) return false;
  if (!state.types.includes(offer.type)) return false;
  if (!state.content.includes(offer.isDlc ? 'dlc' : 'game')) return false;
  if (state.year !== 'all' && `y${yearOf(offer)}` !== state.year) return false;
  // Plusieurs catégories : l'offre doit en avoir au moins une.
  if (state.tags.length > 0 && !offerTags(offer).some((tag) => state.tags.includes(tag))) return false;
  const query = normalize(state.q);
  if (query) {
    const haystack = normalize([offer.title, offer.baseGame?.title ?? '', ...offerTags(offer)].join(' '));
    if (!query.split(' ').every((word) => haystack.includes(word))) return false;
  }
  return true;
}

/** @param {string} sort @returns {(a: Offer, b: Offer) => number} */
function comparator(sort) {
  const end = (/** @type {Offer} */ offer) => Date.parse(offer.endDate ?? '') || 0;
  switch (sort) {
    case 'oldest':
      return (a, b) => end(a) - end(b);
    case 'value':
      return (a, b) => (b.originalPrice ?? -1) - (a.originalPrice ?? -1) || end(b) - end(a);
    case 'name':
      return (a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
    default:
      return (a, b) => end(b) - end(a);
  }
}

/** @param {Offer} offer */
function card(offer) {
  const item = el('li', 'card archive-card');
  item.dataset.id = offer.id;

  const body = el('div', 'card-body');
  const store = el('p', `card-store card-store-${offer.store}`, STORE_LABELS[offer.store] ?? offer.store);
  store.prepend(icon(offer.store === 'epic' ? 'logo-epic' : 'logo-steam'));
  body.append(store, titleElement(offer));
  const tags = tagsElement(offerTags(offer), CARD_TAGS);
  if (tags) body.append(tags);
  const base = baseGameElement(offer);
  if (base) body.append(base);

  body.append(dateRange(offer));
  const price = el('p', 'archive-price');
  if (offer.originalPrice !== null && offer.currency) {
    price.append(el('span', '', 'Prix d’origine '), formatMoney(offer.originalPrice, offer.currency));
  } else {
    price.append(el('span', '', 'Prix d’origine inconnu'));
  }
  body.append(price);

  item.append(coverElement(offer), body);
  return item;
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

/** @param {number} pages */
function renderPagination(pages) {
  pagination.hidden = pages <= 1;
  if (pages <= 1) {
    pagination.replaceChildren();
    return;
  }
  /** @param {number} page @param {string} text @param {string} [label] */
  const button = (page, text, label) => {
    const node = /** @type {HTMLButtonElement} */ (el('button', 'page', text));
    node.type = 'button';
    node.dataset.page = String(page);
    if (label) node.setAttribute('aria-label', label);
    if (page === state.page) node.setAttribute('aria-current', 'page');
    node.disabled = page < 1 || page > pages;
    return node;
  };

  /** @type {HTMLElement[]} */
  const nodes = [button(state.page - 1, '‹', 'Page précédente')];
  /** @type {(number | null)[]} */
  const numbers = [];
  for (let page = 1; page <= pages; page++) {
    if (page === 1 || page === pages || Math.abs(page - state.page) <= 1) numbers.push(page);
    else if (numbers.at(-1) !== null) numbers.push(null);
  }
  for (const page of numbers) {
    nodes.push(page === null ? el('span', 'page-gap', '…') : button(page, String(page), `Page ${page}`));
  }
  nodes.push(button(state.page + 1, '›', 'Page suivante'));
  // Le bouton de la page courante n'a pas à réagir.
  for (const node of nodes) if (node.getAttribute('aria-current') === 'page') /** @type {HTMLButtonElement} */ (node).disabled = true;
  pagination.replaceChildren(...nodes);
}

/** @param {Offer[]} matches */
function renderStats(matches) {
  /** @type {HTMLElement} */ (document.getElementById('stat-count')).textContent = String(matches.length);
  /** @type {HTMLElement} */ (document.getElementById('stat-count-label')).textContent = isDefault(state)
    ? 'Offres archivées'
    : 'Offres trouvées';
  // Un week-end gratuit ne laisse pas le jeu : seule compte la valeur des jeux à garder.
  const value = matches
    .filter((offer) => offer.type !== 'free_weekend' && offer.currency === 'EUR')
    .reduce((sum, offer) => sum + (offer.originalPrice ?? 0), 0);
  /** @type {HTMLElement} */ (document.getElementById('stat-value')).textContent = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value / 100);
  const oldest = archived.reduce((min, offer) => Math.min(min, Date.parse(offer.startDate ?? offer.firstSeen) || min), Infinity);
  /** @type {HTMLElement} */ (document.getElementById('stat-since')).textContent = Number.isFinite(oldest)
    ? monthYearFormat.format(oldest)
    : '—';
}

function buildYearMenu() {
  const years = [...new Set(archived.map(yearOf))].sort((a, b) => b - a);
  /** @type {Record<string, string>} */
  const options = { all: 'Toutes les années' };
  for (const year of years) options[`y${year}`] = String(year);
  yearMenu = createSortMenu(/** @type {HTMLElement} */ (document.getElementById('year-menu')), {
    label: 'Année de fin',
    options,
    value: 'all',
    iconId: 'icon-calendar',
    onChange: (year) => update({ year }),
  });
}

/** Les tags les plus fréquents, avec leur nombre d'offres. */
function buildTagChips() {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const offer of archived) for (const tag of offerTags(offer)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
    .slice(0, TAG_CHIPS);
  if (top.length === 0) return;
  tagChips.append(
    ...top.map(([tag, count]) => {
      const label = el('label', 'chip');
      const input = /** @type {HTMLInputElement} */ (el('input'));
      input.type = 'checkbox';
      input.name = 'tag';
      input.value = tag;
      const text = el('span', '', tag);
      text.append(el('small', 'chip-count', String(count)));
      label.append(input, text);
      return label;
    }),
  );
  tagChips.hidden = false;
}

/** @returns {Partial<State>} */
function readForm() {
  const data = new FormData(form);
  return {
    stores: data.getAll('store').map(String),
    types: data.getAll('type').map(String),
    content: data.getAll('content').map(String),
    tags: data.getAll('tag').map(String),
  };
}

function applyState() {
  searchInput.value = state.q;
  for (const input of form.querySelectorAll('input[type="checkbox"]')) {
    const box = /** @type {HTMLInputElement} */ (input);
    const list = { store: state.stores, type: state.types, content: state.content, tag: state.tags }[box.name] ?? [];
    box.checked = list.includes(box.value);
  }
  yearMenu?.set(state.year);
  sortMenu.set(state.sort);
}

/** @returns {State} */
function defaultState() {
  return { q: '', stores: [...STORES], types: [...TYPES], content: [...CONTENT], tags: [], year: 'all', sort: 'recent', page: 1 };
}

/** @param {State} value */
function isDefault(value) {
  return toParams(value).toString() === '';
}

/** Paramètres d'adresse : seules les valeurs différentes du défaut. @param {State} value */
function toParams(value) {
  const defaults = defaultState();
  const params = new URLSearchParams();
  if (value.q.trim()) params.set('q', value.q.trim());
  /** @param {string} key @param {string[]} list @param {string[]} all */
  const setList = (key, list, all) => {
    if (list.length !== all.length || !all.every((item) => list.includes(item))) params.set(key, list.join(',') || 'aucun');
  };
  setList('magasin', value.stores, defaults.stores);
  setList('type', value.types, defaults.types);
  setList('contenu', value.content, defaults.content);
  if (value.tags.length > 0) params.set('categorie', value.tags.join(','));
  if (value.year !== 'all') params.set('annee', value.year.slice(1));
  if (value.sort !== 'recent') params.set('tri', value.sort);
  return params;
}

function writeUrl() {
  const params = toParams(state);
  if (state.page > 1) params.set('page', String(state.page));
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

/** Adresse illisible ou valeurs inconnues : valeurs par défaut. @returns {State} */
function readUrl() {
  const params = new URLSearchParams(location.search);
  const value = defaultState();
  /** @param {string} key @param {string[]} allowed */
  const list = (key, allowed) => {
    const raw = params.get(key);
    if (raw === null) return null;
    return raw === 'aucun' ? [] : raw.split(',').filter((item) => allowed.includes(item));
  };
  value.q = params.get('q') ?? '';
  value.stores = list('magasin', STORES) ?? value.stores;
  value.types = list('type', TYPES) ?? value.types;
  value.content = list('contenu', CONTENT) ?? value.content;
  const tags = params.get('categorie');
  if (tags) {
    const known = new Set([...tagChips.querySelectorAll('input')].map((input) => /** @type {HTMLInputElement} */ (input).value));
    value.tags = tags.split(',').filter((tag) => known.has(tag));
  }
  const year = params.get('annee');
  if (year && archived.some((offer) => String(yearOf(offer)) === year)) value.year = `y${year}`;
  const sort = params.get('tri');
  if (sort && Object.hasOwn(SORT_LABELS, sort)) value.sort = sort;
  value.page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  return value;
}

/** Année de fin, heure de Paris. @param {Offer} offer */
function yearOf(offer) {
  return Number(yearFormat.format(new Date(offer.endDate ?? 0)));
}

/** Recherche insensible à la casse et aux accents. @param {string} text */
function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
