// Éléments partagés par la page des offres et la page Archives.

/** @typedef {import('../../collector/offer.ts').Offer} Offer */
/** @typedef {import('../../collector/offer.ts').Store} Store */

/** Magasins dans l'ordre d'affichage. @type {Store[]} */
export const STORES = ['steam', 'epic'];
export const STORE_LABELS = { steam: 'Steam', epic: 'Epic Games Store' };
export const TYPE_LABELS = { free_to_keep: 'À garder', free_weekend: 'Week-end gratuit', now_free: 'Devenu gratuit' };
export const CONTENT_LABELS = { game: 'Jeux', dlc: 'DLC' };

export const TIME_ZONE = 'Europe/Paris';

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 */
export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Icône du fichier icons.svg. @param {string} id @param {string} [className] */
export function icon(id, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (className) svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `icons.svg#${id}`);
  svg.append(use);
  return svg;
}

/** Seules les URL https sont affichées. @param {unknown} url */
export function safeUrl(url) {
  return typeof url === 'string' && url.startsWith('https://') ? url : null;
}

/**
 * Lien vers un magasin, dans un nouvel onglet.
 * @param {HTMLAnchorElement} anchor
 * @param {string | null} url
 */
export function linkTo(anchor, url) {
  if (!url) return;
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
}

/**
 * @param {number} cents
 * @param {string} currency
 */
export function formatMoney(cents, currency) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
}

/**
 * Jaquette de la carte, avec les pastilles du type d'offre, DLC et vidéo.
 * @param {Offer} offer
 */
export function coverElement(offer) {
  const cover = el('div', 'cover');
  const image = coverUrl(offer.image);
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
  pills.append(el('span', 'pill', TYPE_LABELS[offer.type] ?? ''));
  if (offer.isDlc) pills.append(el('span', 'pill', 'DLC'));
  if (safeUrl(offer.details?.video)) {
    // Signale qu'une vidéo se lance au survol.
    const video = el('span', 'pill pill-video', 'Vidéo');
    video.prepend(icon('icon-video'));
    pills.append(video);
  }
  cover.append(pills);
  return cover;
}

/**
 * Les jaquettes Epic sont des PNG de 1200 × 1600 (plusieurs Mo) : le CDN d'Epic les redimensionne à la demande.
 * @param {unknown} url
 */
function coverUrl(url) {
  const safe = safeUrl(url);
  if (!safe || !safe.startsWith('https://cdn1.epicgames.com/') || safe.includes('?')) return safe;
  return `${safe}?h=533&quality=medium&resize=1&w=400`;
}

/**
 * Titre de la carte ; son lien couvre toute la carte (voir style.css).
 * @param {Offer} offer
 */
export function titleElement(offer) {
  const title = el('h3');
  const link = /** @type {HTMLAnchorElement} */ (el('a', '', offer.title));
  linkTo(link, safeUrl(offer.url));
  link.setAttribute('aria-label', `${offer.title} sur ${STORE_LABELS[offer.store] ?? offer.store}`);
  title.append(link);
  return title;
}

/**
 * Tags de l'offre, absents des offres enregistrées avant l'ajout des détails.
 * @param {Offer} offer
 */
export function offerTags(offer) {
  const tags = offer.details?.tags;
  return Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string') : [];
}

/**
 * Liste de tags en pastilles, ou null s'il n'y en a pas.
 * @param {string[]} tags
 * @param {number} max
 */
export function tagsElement(tags, max) {
  if (tags.length === 0) return null;
  const list = el('ul', 'tags');
  list.setAttribute('aria-label', 'Tags');
  list.append(...tags.slice(0, max).map((tag) => el('li', 'tag', tag)));
  return list;
}

/**
 * « Nécessite : jeu de base » pour un DLC, ou null.
 * @param {Offer} offer
 */
export function baseGameElement(offer) {
  if (!offer.isDlc) return null;
  const base = el('p', 'base-game', 'Nécessite : ');
  const baseUrl = safeUrl(offer.baseGame?.url ?? null);
  if (offer.baseGame && baseUrl) {
    const link = /** @type {HTMLAnchorElement} */ (el('a', '', offer.baseGame.title));
    linkTo(link, baseUrl);
    base.append(link);
  } else {
    base.append(offer.baseGame?.title ?? 'le jeu de base');
  }
  return base;
}
