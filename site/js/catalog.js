// Liste d'offres avec recherche, filtres, catégories, période, tri et pagination.
// Partagée par les pages Archives et Devenus gratuits, qui la configurent (initCatalog).
// L'état des filtres est dans l'adresse de la page, pour pouvoir la partager ou y revenir.

import { baseGameElement, CONTENT_LABELS, coverElement, el, icon, offerTags, STORE_LABELS, STORES, tagsElement, TIME_ZONE, titleElement } from './common.js';
import { initPreview } from './preview.js';
import { createSortMenu } from './sortMenu.js';

/** @typedef {import('../../collector/offer.ts').Offer} Offer */
/**
 * @typedef {object} State
 * @property {string} q
 * @property {string[]} stores
 * @property {string[]} types
 * @property {string[]} content
 * @property {string[]} tags
 * @property {string} period clé d'une option de période (« tout », « y2026 »…)
 * @property {string} sort
 * @property {number} page
 */
/**
 * @typedef {object} Period
 * @property {string} label nom du menu
 * @property {string} param paramètre d'adresse
 * @property {string} defaultKey option par défaut, absente de l'adresse
 * @property {(offers: Offer[]) => Record<string, string>} options options du menu, construites à partir des offres
 * @property {(offer: Offer, key: string) => boolean} matches
 */
/**
 * @typedef {object} CatalogConfig
 * @property {() => Promise<Offer[]>} load
 * @property {(offer: Offer) => string | null} dateOf date de référence (ISO) : tri et période
 * @property {string[]} types types d'offre possibles ; le filtre de type n'existe que s'il y en a plusieurs
 * @property {Record<string, string>} sortLabels parmi recent, oldest, value, name ; la première est le tri par défaut
 * @property {string} sortLabel nom du menu de tri
 * @property {Period} period
 * @property {string} cardClass
 * @property {(offer: Offer) => HTMLElement[]} cardLines lignes ajoutées en bas de la carte
 * @property {(matches: Offer[], all: Offer[], isDefault: boolean) => void} renderStats
 * @property {{ one: string, many: string }} noun « offre » / « offres »
 * @property {{ empty: string, error: string }} messages aucune offre du tout ; chargement impossible
 */

const PAGE_SIZE = 24;
/** Catégories proposées : les tags les plus fréquents des offres de la page. */
const TAG_CHIPS = 12;
const CARD_TAGS = 2;
const SEARCH_DELAY = 150;
const CONTENT = Object.keys(CONTENT_LABELS);

const yearFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, year: 'numeric' });

/** Année d'une date ISO, heure de Paris. @param {string | null} iso */
export function yearOf(iso) {
  return Number(yearFormat.format(new Date(iso ?? 0)));
}

/** Options « une par année », de la plus récente à la plus ancienne. @param {Offer[]} offers @param {(offer: Offer) => string | null} dateOf */
export function yearOptions(offers, dateOf) {
  /** @type {Record<string, string>} */
  const options = {};
  for (const year of [...new Set(offers.map((offer) => yearOf(dateOf(offer))))].sort((a, b) => b - a)) {
    options[`y${year}`] = String(year);
  }
  return options;
}

/** @param {CatalogConfig} config */
export function initCatalog(config) {
  const form = /** @type {HTMLFormElement} */ (document.getElementById('filters'));
  const searchInput = /** @type {HTMLInputElement} */ (form.elements.namedItem('q'));
  const tagChips = /** @type {HTMLFieldSetElement} */ (document.getElementById('tag-chips'));
  const results = /** @type {HTMLUListElement} */ (document.getElementById('results'));
  const message = /** @type {HTMLElement} */ (document.getElementById('message'));
  const resetButton = /** @type {HTMLButtonElement} */ (document.getElementById('reset'));
  const pagination = /** @type {HTMLElement} */ (document.getElementById('pagination'));
  const stats = /** @type {HTMLElement} */ (document.getElementById('stats'));
  const hasTypeFilter = config.types.length > 1;
  const defaultSort = Object.keys(config.sortLabels)[0] ?? 'recent';

  /** @type {Offer[]} */
  let offers = [];
  /** @type {Record<string, string>} */
  let periodOptions = {};
  /** @type {State} */
  let state = defaultState();

  /** Construit une fois les offres chargées. @type {import('./sortMenu.js').SortMenu | null} */
  let periodMenu = null;
  const sortMenu = createSortMenu(/** @type {HTMLElement} */ (document.getElementById('sort-menu')), {
    label: config.sortLabel,
    options: config.sortLabels,
    value: defaultSort,
    onChange: (sort) => update({ sort }),
  });

  const preview = initPreview(/** @type {HTMLElement} */ (document.querySelector('main')), (id) =>
    offers.find((offer) => offer.id === id),
  );

  init();

  async function init() {
    try {
      offers = await config.load();
    } catch {
      message.textContent = config.messages.error;
      return;
    }
    if (offers.length === 0) {
      message.textContent = config.messages.empty;
      return;
    }

    buildPeriodMenu();
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

  /** @param {Partial<State>} changes @param {boolean} [resetPage] */
  function update(changes, resetPage = true) {
    state = { ...state, ...changes, ...(resetPage ? { page: 1 } : {}) };
    render();
  }

  function render() {
    preview.hide();
    const matches = offers.filter(matchesState).sort(comparator(state.sort));
    const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), pages);
    const first = (state.page - 1) * PAGE_SIZE;
    const shown = matches.slice(first, first + PAGE_SIZE);
    const { one, many } = config.noun;

    results.replaceChildren(...shown.map(card));
    message.textContent =
      matches.length === 0
        ? 'Rien ne correspond à ces filtres.'
        : `${first + 1}–${first + shown.length} sur ${matches.length} ${matches.length > 1 ? many : one}`;
    const isDefault = isDefaultState(state);
    resetButton.hidden = isDefault;
    renderPagination(pages);
    config.renderStats(matches, offers, isDefault);
    writeUrl();
  }

  /** @param {Offer} offer */
  function matchesState(offer) {
    if (!state.stores.includes(offer.store)) return false;
    if (!state.types.includes(offer.type)) return false;
    if (!state.content.includes(offer.isDlc ? 'dlc' : 'game')) return false;
    if (!config.period.matches(offer, state.period)) return false;
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
    const date = (/** @type {Offer} */ offer) => Date.parse(config.dateOf(offer) ?? '') || 0;
    switch (sort) {
      case 'oldest':
        return (a, b) => date(a) - date(b);
      case 'value':
        return (a, b) => (b.originalPrice ?? -1) - (a.originalPrice ?? -1) || date(b) - date(a);
      case 'name':
        return (a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
      default:
        return (a, b) => date(b) - date(a);
    }
  }

  /** @param {Offer} offer */
  function card(offer) {
    const item = el('li', config.cardClass);
    item.dataset.id = offer.id;

    const body = el('div', 'card-body');
    const store = el('p', `card-store card-store-${offer.store}`, STORE_LABELS[offer.store] ?? offer.store);
    store.prepend(icon(offer.store === 'epic' ? 'logo-epic' : 'logo-steam'));
    body.append(store, titleElement(offer));
    const tags = tagsElement(offerTags(offer), CARD_TAGS);
    if (tags) body.append(tags);
    const base = baseGameElement(offer);
    if (base) body.append(base);
    body.append(...config.cardLines(offer));

    item.append(coverElement(offer), body);
    return item;
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

  function buildPeriodMenu() {
    periodOptions = config.period.options(offers);
    periodMenu = createSortMenu(/** @type {HTMLElement} */ (document.getElementById('period-menu')), {
      label: config.period.label,
      options: periodOptions,
      value: config.period.defaultKey,
      iconId: 'icon-calendar',
      onChange: (period) => update({ period }),
    });
  }

  /** Les tags les plus fréquents, avec leur nombre d'offres. */
  function buildTagChips() {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const offer of offers) for (const tag of offerTags(offer)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
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
      ...(hasTypeFilter ? { types: data.getAll('type').map(String) } : {}),
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
    periodMenu?.set(state.period);
    sortMenu.set(state.sort);
  }

  /** @returns {State} */
  function defaultState() {
    return {
      q: '',
      stores: [...STORES],
      types: [...config.types],
      content: [...CONTENT],
      tags: [],
      period: config.period.defaultKey,
      sort: defaultSort,
      page: 1,
    };
  }

  /** @param {State} value */
  function isDefaultState(value) {
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
    if (hasTypeFilter) setList('type', value.types, defaults.types);
    setList('contenu', value.content, defaults.content);
    if (value.tags.length > 0) params.set('categorie', value.tags.join(','));
    // Une année s'écrit sans son préfixe : « annee=2026 ».
    if (value.period !== defaults.period) params.set(config.period.param, value.period.replace(/^y(?=\d{4}$)/, ''));
    if (value.sort !== defaults.sort) params.set('tri', value.sort);
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
    if (hasTypeFilter) value.types = list('type', config.types) ?? value.types;
    value.content = list('contenu', CONTENT) ?? value.content;
    const tags = params.get('categorie');
    if (tags) {
      const known = new Set([...tagChips.querySelectorAll('input')].map((input) => /** @type {HTMLInputElement} */ (input).value));
      value.tags = tags.split(',').filter((tag) => known.has(tag));
    }
    const period = params.get(config.period.param);
    const periodKey = period && /^\d{4}$/.test(period) ? `y${period}` : period;
    if (periodKey && Object.hasOwn(periodOptions, periodKey)) value.period = periodKey;
    const sort = params.get('tri');
    if (sort && Object.hasOwn(config.sortLabels, sort)) value.sort = sort;
    value.page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
    return value;
  }
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
