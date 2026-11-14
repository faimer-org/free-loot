// Liste déroulante de tri, identique sur tous les navigateurs (un <select> natif ne se laisse pas habiller partout).
// Motif ARIA « select-only combobox » simplifié : bouton + liste d'options (role="listbox").

let instances = 0;

/**
 * @typedef {object} SortMenu
 * @property {() => string} get
 * @property {(value: string) => void} set
 */

/**
 * Construit le menu dans `root` (vidé au préalable).
 * @param {HTMLElement} root
 * @param {{ label: string, options: Record<string, string>, value: string, onChange: (value: string) => void }} config
 * @returns {SortMenu}
 */
export function createSortMenu(root, { label, options, value, onChange }) {
  const id = `sort-menu-${++instances}`;
  const entries = Object.entries(options);
  let current = Object.hasOwn(options, value) ? value : (entries[0]?.[0] ?? '');
  let active = 0;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sort-button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', `${id}-list`);
  const buttonText = document.createElement('span');
  button.append(icon('icon-sort', 'sort-icon'), buttonText, icon('icon-chevron', 'sort-chevron'));

  const list = document.createElement('ul');
  list.className = 'sort-list';
  list.id = `${id}-list`;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', label);
  list.tabIndex = -1;
  list.hidden = true;

  const items = entries.map(([key, text], index) => {
    const item = document.createElement('li');
    item.id = `${id}-${index}`;
    item.setAttribute('role', 'option');
    item.dataset.value = key;
    item.textContent = text;
    item.addEventListener('mousemove', () => highlight(index));
    item.addEventListener('click', () => choose(index));
    return item;
  });
  list.append(...items);
  root.replaceChildren(button, list);

  function sync() {
    const index = Math.max(0, entries.findIndex(([key]) => key === current));
    buttonText.textContent = entries[index]?.[1] ?? '';
    button.setAttribute('aria-label', `${label} : ${buttonText.textContent}`);
    items.forEach((item, i) => item.setAttribute('aria-selected', String(i === index)));
  }

  /** @param {number} index */
  function highlight(index) {
    active = (index + items.length) % items.length;
    items.forEach((item, i) => item.classList.toggle('is-active', i === active));
    list.setAttribute('aria-activedescendant', items[active]?.id ?? '');
    items[active]?.scrollIntoView({ block: 'nearest' });
  }

  function open() {
    if (!list.hidden) return;
    list.hidden = false;
    root.classList.add('is-open');
    button.setAttribute('aria-expanded', 'true');
    highlight(Math.max(0, entries.findIndex(([key]) => key === current)));
    list.focus();
    document.addEventListener('pointerdown', onOutside, true);
  }

  /** @param {boolean} [refocus] */
  function close(refocus = true) {
    if (list.hidden) return;
    list.hidden = true;
    root.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    if (refocus) button.focus();
  }

  /** @param {number} index */
  function choose(index) {
    const key = entries[index]?.[0];
    close();
    if (key === undefined || key === current) return;
    current = key;
    sync();
    onChange(current);
  }

  /**
   * Clic hors du menu : le ferme sans activer ce qui est dessous (une carte est un lien), comme un select natif.
   * @param {PointerEvent} event
   */
  function onOutside(event) {
    if (root.contains(/** @type {Node} */ (event.target))) return;
    close(false);
    /** @param {MouseEvent} click */
    const swallow = (click) => {
      click.preventDefault();
      click.stopPropagation();
    };
    document.addEventListener('click', swallow, { capture: true, once: true });
    // Pas de clic après ce pointerdown (glisser, défilement tactile) : ne pas avaler le clic suivant.
    document.addEventListener('pointerup', () => setTimeout(() => document.removeEventListener('click', swallow, true)), {
      once: true,
    });
  }

  button.addEventListener('click', () => (list.hidden ? open() : close()));
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
    }
  });

  list.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowDown':
        highlight(active + 1);
        break;
      case 'ArrowUp':
        highlight(active - 1);
        break;
      case 'Home':
        highlight(0);
        break;
      case 'End':
        highlight(items.length - 1);
        break;
      case 'Enter':
      case ' ':
        choose(active);
        break;
      case 'Escape':
        close();
        break;
      case 'Tab':
        close(false);
        return; // laisse le focus suivre son cours
      default: {
        // Saisie : va à la première option qui commence par la lettre tapée.
        if (event.key.length !== 1) return;
        const letter = event.key.toLocaleLowerCase('fr');
        const found = items.findIndex((item) => item.textContent?.toLocaleLowerCase('fr').startsWith(letter));
        if (found >= 0) highlight(found);
        return;
      }
    }
    event.preventDefault();
  });
  list.addEventListener('focusout', (event) => {
    if (!root.contains(/** @type {Node | null} */ (event.relatedTarget))) close(false);
  });

  sync();
  return {
    get: () => current,
    set(value) {
      if (!Object.hasOwn(options, value)) return;
      current = value;
      sync();
    },
  };
}

/**
 * @param {string} id
 * @param {string} className
 */
function icon(id, className) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}
