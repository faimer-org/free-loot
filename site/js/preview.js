// Aperçu d'une offre au survol de sa carte : vidéo ou captures, tags, description.
// Souris uniquement (rien sur écran tactile) ; au clavier, il suit le focus du lien de la carte.
// Médias en boucle : vidéo, puis chaque capture, puis de nouveau la vidéo.
// Un clic sur la carte (y compris molette ou Ctrl + clic) ferme l'aperçu et retire l'effet de survol
// jusqu'à ce que la souris quitte la carte (classe is-clicked).

/** @typedef {import('../../collector/offer.ts').Offer} Offer */

/** Délai avant l'ouverture : évite un aperçu à chaque carte traversée. */
const OPEN_DELAY = 350;
/** Durée d'affichage de chaque capture. */
const SLIDE_INTERVAL = 2000;
const WIDTH = 360;
const GAP = 12;
const MARGIN = 8;

/**
 * @param {HTMLElement} root conteneur des cartes (délégation d'événements)
 * @param {(id: string) => Offer | undefined} findOffer
 * @returns {{ hide: () => void }}
 */
export function initPreview(root, findOffer) {
  const canHover = matchMedia('(hover: hover) and (pointer: fine)');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const panel = el('div', 'preview');
  panel.id = 'preview';
  panel.setAttribute('role', 'tooltip');
  panel.hidden = true;

  const media = el('div', 'preview-media');
  const video = /** @type {HTMLVideoElement} */ (el('video'));
  video.muted = true;
  video.playsInline = true;
  video.preload = 'none';
  video.setAttribute('aria-hidden', 'true');
  const image = /** @type {HTMLImageElement} */ (el('img'));
  image.alt = '';
  image.referrerPolicy = 'no-referrer';
  const dots = el('div', 'preview-dots');
  dots.setAttribute('aria-hidden', 'true');
  media.append(video, image, dots);

  const body = el('div', 'preview-body');
  const title = el('p', 'preview-title');
  const tags = el('ul', 'tags');
  tags.setAttribute('aria-label', 'Tags');
  const description = el('p', 'preview-description');
  description.id = 'preview-description';
  body.append(title, tags, description);
  panel.append(media, body);
  document.body.append(panel);

  /** @type {HTMLElement | null} */
  let current = null;
  /** Ouvert au clavier : la page défile pour montrer la carte, l'aperçu la suit au lieu de se fermer. */
  let viaFocus = false;
  let openTimer = 0;
  let slideTimer = 0;
  /** Captures de l'offre affichée, montrées entre deux lectures de la vidéo. @type {string[]} */
  let shots = [];

  video.addEventListener('error', () => {
    // Vidéo illisible (format, réseau) : on passe aux captures, sans revenir à la vidéo.
    if (!video.hidden && current) showScreenshots(false);
  });

  video.addEventListener('ended', () => {
    if (video.hidden) return;
    if (shots.length > 0) showScreenshots(true);
    else playVideo();
  });

  root.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'mouse' || !canHover.matches) return;
    const card = cardOf(event.target);
    if (!card || card === current || card.classList.contains('is-clicked')) return;
    hide();
    current = card;
    openTimer = window.setTimeout(() => show(card), OPEN_DELAY);
  });

  root.addEventListener('pointerout', (event) => {
    const card = cardOf(event.target);
    if (!card || card.contains(/** @type {Node | null} */ (event.relatedTarget))) return;
    if (card === current) hide();
    if (event.pointerType === 'mouse') card.classList.remove('is-clicked');
  });

  // Clic souris (gauche ou molette, avec ou sans Ctrl) : l'offre s'ouvre dans un autre onglet,
  // la carte ne doit plus paraître survolée. Au clavier (detail = 0), l'aperçu reste : il suit le focus.
  /** @param {MouseEvent} event */
  const onClick = (event) => {
    if (event.detail === 0 || event.button > 1) return;
    const card = cardOf(event.target);
    if (!card) return;
    if (card === current) hide();
    card.classList.add('is-clicked');
  };
  root.addEventListener('click', onClick);
  root.addEventListener('auxclick', onClick);

  root.addEventListener('focusin', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (!target.matches('.card h3 a:focus-visible')) return;
    const card = cardOf(target);
    if (!card) return;
    hide();
    current = card;
    viaFocus = true;
    show(card);
  });

  root.addEventListener('focusout', () => hide());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide();
  });
  // À la souris, le défilement ferme l'aperçu (le curseur n'est plus sur la carte) ; au clavier, il la suit.
  window.addEventListener(
    'scroll',
    () => {
      if (viaFocus && current && !panel.hidden) place(current);
      else hide();
    },
    { passive: true, capture: true },
  );
  window.addEventListener('resize', () => hide());

  /** @param {HTMLElement} card */
  function show(card) {
    const offer = findOffer(card.dataset.id ?? '');
    const details = offer?.details;
    if (!offer || !details) return;
    shots = screenshotsOf(offer);
    const clip = reduceMotion.matches ? null : safeUrl(details.video);
    const text = typeof details.description === 'string' ? details.description : '';
    if (!clip && shots.length === 0 && !text) return;

    title.textContent = offer.title;
    const names = Array.isArray(details.tags) ? details.tags.map(String) : [];
    tags.replaceChildren(...names.map((name) => el('li', 'tag', name)));
    tags.hidden = names.length === 0;
    description.textContent = text;
    description.hidden = !text;

    media.hidden = !clip && shots.length === 0;
    if (clip) {
      video.poster = shots[0] ?? '';
      video.src = clip;
      playVideo();
      // Préchargement des captures pour qu'elles s'affichent sans attente à la fin de la vidéo.
      for (const url of shots) new Image().src = url;
    } else if (shots.length > 0) {
      showScreenshots(false);
    }

    panel.hidden = false;
    place(card);
    panel.classList.add('is-visible');
    card.querySelector('h3 a')?.setAttribute('aria-describedby', description.id);
  }

  /** Vidéo depuis le début ; la source est conservée d'un tour à l'autre (pas de nouveau téléchargement). */
  function playVideo() {
    window.clearInterval(slideTimer);
    image.hidden = true;
    image.removeAttribute('src');
    dots.replaceChildren();
    video.hidden = false;
    video.currentTime = 0;
    video.play().catch(() => {
      // Lecture refusée ou interrompue : la vidéo reste sur son affiche, ou l'événement error prend le relais.
    });
  }

  /**
   * Défilement des captures de l'offre affichée.
   * @param {boolean} backToVideo après la dernière capture, relancer la vidéo (sinon les captures bouclent)
   */
  function showScreenshots(backToVideo) {
    if (backToVideo) video.pause();
    else stopVideo();
    video.hidden = true;
    image.hidden = false;
    let index = 0;
    const dotNodes = shots.map(() => el('span'));
    dots.replaceChildren(...(shots.length > 1 ? dotNodes : []));
    const go = (/** @type {number} */ next) => {
      index = next % shots.length;
      image.src = shots[index] ?? '';
      dotNodes.forEach((dot, i) => dot.classList.toggle('is-current', i === index));
    };
    go(0);
    // Préchargement des captures suivantes pour un défilement sans attente.
    for (const url of shots.slice(1)) new Image().src = url;
    window.clearInterval(slideTimer);
    if (backToVideo) {
      slideTimer = window.setInterval(() => {
        if (index + 1 < shots.length) go(index + 1);
        else playVideo();
      }, SLIDE_INTERVAL);
    } else if (shots.length > 1 && !reduceMotion.matches) {
      slideTimer = window.setInterval(() => go(index + 1), SLIDE_INTERVAL);
    }
  }

  /** À droite de la carte, sinon à gauche, sinon par-dessus ; toujours dans la fenêtre. @param {HTMLElement} card */
  function place(card) {
    const rect = card.getBoundingClientRect();
    const width = Math.min(WIDTH, window.innerWidth - 2 * MARGIN);
    panel.style.width = `${width}px`;
    let left;
    if (rect.right + GAP + width <= window.innerWidth - MARGIN) left = rect.right + GAP;
    else if (rect.left - GAP - width >= MARGIN) left = rect.left - GAP - width;
    else left = rect.left + (rect.width - width) / 2;
    left = Math.min(Math.max(left, MARGIN), window.innerWidth - width - MARGIN);
    const height = panel.offsetHeight;
    const top = Math.min(Math.max(rect.top, MARGIN), window.innerHeight - height - MARGIN);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(Math.max(top, MARGIN))}px`;
  }

  function stopVideo() {
    video.pause();
    if (video.getAttribute('src')) {
      // Retirer la source arrête le téléchargement en cours.
      video.removeAttribute('src');
      video.load();
    }
  }

  function hide() {
    window.clearTimeout(openTimer);
    window.clearInterval(slideTimer);
    if (current) current.querySelector('h3 a')?.removeAttribute('aria-describedby');
    current = null;
    viaFocus = false;
    if (panel.hidden) return;
    panel.classList.remove('is-visible');
    panel.hidden = true;
    stopVideo();
    image.removeAttribute('src');
  }

  return { hide };
}

/** @param {Offer | undefined} offer */
function screenshotsOf(offer) {
  const shots = offer?.details?.screenshots;
  return Array.isArray(shots) ? shots.map((url) => safeUrl(url)).filter((url) => url !== null) : [];
}

/** @param {EventTarget | null} target */
function cardOf(target) {
  return target instanceof Element ? /** @type {HTMLElement | null} */ (target.closest('.card')) : null;
}

/** Seules les URL https sont utilisées. @param {unknown} url */
function safeUrl(url) {
  return typeof url === 'string' && url.startsWith('https://') ? url : null;
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
