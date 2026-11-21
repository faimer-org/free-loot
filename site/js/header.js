// En-tête commun aux trois pages : date de mise à jour, onglets, et barre compacte qui apparaît
// quand les onglets sortent de l'écran, avec un bouton « Filtres » qui ouvre le formulaire de la page
// dans un panneau sous la barre. Le formulaire est déplacé, pas copié : un seul état de filtres.

import { el, icon, relativeDay } from './common.js';

/**
 * @typedef {object} HeaderConfig
 * @property {HTMLFormElement} form filtres de la page ; masqué (`hidden`), le bouton Filtres l'est aussi
 * @property {() => number} changes nombre de critères différents du défaut
 * @property {() => void} reset remet les filtres par défaut et met la page à jour
 */
/** @typedef {{ refresh: () => void }} Header */

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Date de génération des données, sur chaque pastille « Mis à jour ». @param {{ generatedAt?: unknown }} data */
export function showUpdated(data) {
  const date = typeof data.generatedAt === 'string' ? new Date(data.generatedAt) : null;
  const known = date !== null && !Number.isNaN(date.getTime());
  setStatus(known ? `Mis à jour ${relativeDay(date)}` : 'Date de mise à jour inconnue', false);
}

/** Données impossibles à charger. */
export function showUpdateError() {
  setStatus('Données indisponibles', true);
}

/** @param {string} text @param {boolean} error */
function setStatus(text, error) {
  for (const node of document.querySelectorAll('.updated')) {
    node.textContent = text;
    node.classList.toggle('is-error', error);
  }
}

/** @param {HeaderConfig} config @returns {Header} */
export function initHeader({ form, changes, reset }) {
  const header = /** @type {HTMLElement} */ (document.querySelector('.page-header'));
  const tabs = /** @type {HTMLElement} */ (header.querySelector('.tabs'));
  const logo = /** @type {HTMLImageElement} */ (header.querySelector('.logo'));
  const status = /** @type {HTMLElement} */ (header.querySelector('.updated'));

  // Barre compacte : logo, onglets et date repris de l'en-tête, plus le bouton Filtres.
  const bar = el('div', 'compact-bar');
  bar.inert = true;
  const inner = el('div', 'compact-inner');

  const barLogo = /** @type {HTMLImageElement} */ (logo.cloneNode());
  barLogo.alt = '';
  const barTabs = /** @type {HTMLElement} */ (tabs.cloneNode(true));
  barTabs.setAttribute('aria-label', 'Pages (barre fixe)');
  const barStatus = el('p', status.className, status.textContent ?? '');

  const button = /** @type {HTMLButtonElement} */ (el('button', 'filter-button'));
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'filter-panel');
  const count = el('span', 'filter-count');
  count.setAttribute('aria-hidden', 'true');
  button.append(icon('icon-filter'), el('span', 'filter-label', 'Filtres'), count);

  const end = el('div', 'compact-end');
  end.append(barStatus, button);
  inner.append(barLogo, barTabs, end);

  const panel = el('div', 'filter-panel');
  panel.id = 'filter-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Filtres');
  panel.inert = true;
  const panelBody = el('div', 'filter-panel-body');
  const actions = el('div', 'filter-panel-actions');
  const resetButton = /** @type {HTMLButtonElement} */ (el('button', 'filter-reset', 'Réinitialiser'));
  resetButton.type = 'button';
  const doneButton = /** @type {HTMLButtonElement} */ (el('button', 'filter-done', 'Voir les offres'));
  doneButton.type = 'button';
  actions.append(resetButton, doneButton);
  panelBody.append(actions);
  panel.append(panelBody);

  bar.append(inner, panel);
  header.after(bar);

  /** Place du formulaire dans la page pendant qu'il est dans le panneau : la page ne bouge pas. */
  const holder = el('div', 'filters-holder');
  let navVisible = true;
  let panelOpen = false;

  function updateBar() {
    const shown = !navVisible || panelOpen;
    bar.classList.toggle('is-shown', shown);
    bar.inert = !shown;
  }

  // Les onglets de l'en-tête au-dessus de l'écran : la barre descend. En dessous (page courte), rien.
  new IntersectionObserver(([entry]) => {
    if (!entry) return;
    navVisible = entry.isIntersecting || entry.boundingClientRect.top > 0;
    updateBar();
  }).observe(tabs);

  function openPanel() {
    if (panelOpen || form.hidden) return;
    holder.style.height = `${form.getBoundingClientRect().height}px`;
    holder.style.marginTop = getComputedStyle(form).marginTop;
    form.replaceWith(holder);
    panelBody.prepend(form);
    panelOpen = true;
    panel.classList.add('is-open');
    panel.inert = false;
    button.setAttribute('aria-expanded', 'true');
    updateBar();
    // Pas de focus automatique dans le formulaire : il ferait surgir le clavier sur mobile.
  }

  /** @param {boolean} [refocus] rend le focus au bouton Filtres */
  function closePanel(refocus = false) {
    if (!panelOpen) return;
    holder.replaceWith(form);
    panelOpen = false;
    panel.classList.remove('is-open');
    panel.inert = true;
    button.setAttribute('aria-expanded', 'false');
    updateBar();
    if (refocus) button.focus();
  }

  button.addEventListener('click', () => (panelOpen ? closePanel() : openPanel()));
  doneButton.addEventListener('click', () => closePanel(true));
  resetButton.addEventListener('click', () => {
    reset();
    refresh();
  });
  document.addEventListener('keydown', (event) => {
    // Échap déjà traité par un menu déroulant du formulaire : il ne ferme que ce menu.
    if (event.key === 'Escape' && panelOpen && !event.defaultPrevented) closePanel(true);
  });
  document.addEventListener('click', (event) => {
    const target = /** @type {Node} */ (event.target);
    if (panelOpen && target.isConnected && !panel.contains(target) && !button.contains(target)) closePanel();
  });

  // Onglet de la page courante : retour en haut en douceur, sans recharger la page (ni perdre les filtres).
  for (const nav of [tabs, barTabs]) {
    nav.addEventListener('click', (event) => {
      const link = /** @type {HTMLElement} */ (event.target).closest('a[aria-current="page"]');
      if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      closePanel();
      window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    });
  }

  function refresh() {
    button.hidden = form.hidden;
    const n = changes();
    count.textContent = String(n);
    count.hidden = n === 0;
    button.setAttribute('aria-label', n > 0 ? `Filtres, ${n} modifié${n > 1 ? 's' : ''}` : 'Filtres');
    resetButton.disabled = n === 0;
  }

  refresh();
  return { refresh };
}
