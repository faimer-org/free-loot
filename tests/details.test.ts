import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { cleanDescription, mergeDetails } from '../collector/details.ts';
import { epicDetails, type EpicResponse } from '../collector/epic.ts';
import type { Details, DetectedOffer, Offer } from '../collector/offer.ts';
import { mergeOffers } from '../collector/state.ts';
import { matchSteamApp, normalizeTitle, steamDetails, steamTags } from '../collector/steam/details.ts';
import type { StoreItem } from '../collector/steam/storeBrowse.ts';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8'));

// Réponses réelles du 2026-11-14.
// GetItems de Company of Heroes 3 avec tags, captures (« contenu adulte » seulement) et bandes-annonces.
const coh3 = (): StoreItem => fixture('steam-getitems-details-coh3-2026-11-14.json').response.store_items[0];
const tagNames = (): Map<number, string> =>
  new Map(
    fixture('steam-taglist-fr-2026-11-14.json').response.tags.map((tag: { tagid: number; name: string }) => [
      tag.tagid,
      tag.name,
    ]),
  );
const epicElement = (title: string) => {
  const json: EpicResponse = fixture('epic-2026-11-14.json');
  const found = json.data.Catalog.searchStore.elements.find((element) => element.title === title);
  assert.ok(found);
  return found;
};

describe('steamDetails', () => {
  it('donne les tags en français par poids décroissant, sans « Jeu solo » ni « Multijoueur »', () => {
    assert.deepEqual(steamTags(coh3(), tagNames()), [
      'Stratégie',
      'Stratégie en temps réel',
      'Simulation de guerre',
      'Action et stratégie en temps réel',
      'Seconde Guerre mondiale',
    ]);
  });

  it('reprend la description et les captures « contenu adulte » d’un jeu violent', () => {
    const details = steamDetails(coh3(), tagNames());
    assert.match(details.description ?? '', /^Plus impressionnant que jamais, Company of Heroes 3/);
    assert.equal(details.screenshots.length, 4);
    assert.match(
      details.screenshots[0] ?? '',
      /^https:\/\/shared\.fastly\.steamstatic\.com\/store_item_assets\/steam\/apps\/1677280\/.+\/ss_[0-9a-f]+\.600x338\.jpg\?t=\d+$/,
    );
    assert.match(details.video ?? '', /^https:\/\/video\.fastly\.steamstatic\.com\/store_trailers\/1677280\/.+\/microtrailer\.mp4$/);
  });

  it('préfère les captures « tout public »', () => {
    const item: StoreItem = {
      ...coh3(),
      screenshots: {
        all_ages_screenshots: [{ filename: 'steam/apps/1/b.jpg', ordinal: 2 }, { filename: 'steam/apps/1/a.jpg', ordinal: 1 }],
        mature_content_screenshots: [{ filename: 'steam/apps/1/m.jpg', ordinal: 1 }],
      },
    };
    assert.deepEqual(steamDetails(item, tagNames()).screenshots, [
      'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1/a.600x338.jpg',
      'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1/b.600x338.jpg',
    ]);
  });

  it('ne garde ni capture ni vidéo pour un jeu avec nudité ou contenu sexuel', () => {
    const details = steamDetails({ ...coh3(), content_descriptorids: [1, 5] }, tagNames());
    assert.deepEqual(details.screenshots, []);
    assert.equal(details.video, null);
    assert.ok(details.tags.length > 0);
  });

  it('ignore les tags dont le nom est inconnu', () => {
    assert.deepEqual(steamTags({ ...coh3(), tags: [{ tagid: 999_999_999, weight: 1 }] }, tagNames()), []);
  });
});

describe('matchSteamApp', () => {
  const results = () => fixture('steam-storesearch-alien-isolation-2026-11-14.json').items;

  it('retient le nom exact, pas le premier résultat (« Alien: Isolation 2 »)', () => {
    assert.equal(matchSteamApp(results(), 'Alien: Isolation'), 214490);
  });

  it('ignore casse, ponctuation, accents et symboles de marque', () => {
    assert.equal(normalizeTitle('ALIEN™ : Isolation'), 'alien isolation');
    assert.equal(normalizeTitle('Éternel Retour®'), 'eternel retour');
    assert.equal(matchSteamApp(results(), 'alien isolation'), 214490);
  });

  it('renvoie null sans correspondance exacte', () => {
    assert.equal(matchSteamApp(results(), 'Alien'), null);
  });
});

describe('epicDetails', () => {
  it('reprend la description et 4 captures redimensionnées, sans tags ni vidéo', () => {
    const details = epicDetails(epicElement('Knightica'));
    assert.match(details.description ?? '', /^Recrutez des unités puissantes/);
    assert.equal(details.screenshots.length, 4);
    assert.equal(
      details.screenshots[0],
      'https://cdn1.epicgames.com/spt-assets/357100ca5613420e98208c5f14585e9d/knightica-aqy9g.png?h=338&quality=medium&resize=1&w=600',
    );
    assert.deepEqual(details.tags, []);
    assert.equal(details.video, null);
  });

  it('écarte une description qui répète le titre', () => {
    assert.equal(epicDetails(epicElement("Them's Fightin' Herds")).description, null);
  });
});

describe('cleanDescription', () => {
  it('retire les balises, décode les entités et resserre les espaces', () => {
    assert.equal(cleanDescription('<b>Un  jeu</b>&nbsp;&quot;culte&quot; &amp; &#233;pique'), 'Un jeu "culte" & épique');
  });

  it('borne la longueur', () => {
    const text = cleanDescription('a '.repeat(500)) ?? '';
    assert.ok(text.length <= 400);
    assert.ok(text.endsWith('…'));
  });

  it('renvoie null pour un texte vide', () => {
    assert.equal(cleanDescription('  <br> '), null);
    assert.equal(cleanDescription(undefined), null);
  });
});

describe('mergeDetails', () => {
  const known: Details = { tags: ['Action'], description: 'Connue', screenshots: ['https://a/1.jpg'], video: 'https://a/v.mp4' };

  it('garde les champs connus quand la nouvelle lecture est vide', () => {
    assert.deepEqual(mergeDetails(known, { tags: [], description: null, screenshots: [], video: null }), known);
  });

  it('remplace les champs relus', () => {
    const fresh: Details = { tags: ['RPG'], description: 'Nouvelle', screenshots: ['https://b/1.jpg'], video: null };
    assert.deepEqual(mergeDetails(known, fresh), { ...fresh, video: 'https://a/v.mp4' });
  });

  it('conserve les détails d’une offre relue sans détails (source indisponible)', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    const candidate: DetectedOffer = {
      store: 'epic',
      storeId: 'ns:abc',
      type: 'free_to_keep',
      title: 'Knightica',
      isDlc: false,
      baseGame: null,
      originalPrice: 1349,
      currency: 'EUR',
      startDate: '2026-11-12T16:00:00.000Z',
      endDate: '2026-11-19T16:00:00.000Z',
      url: 'https://store.epicgames.com/fr/p/knightica',
      image: null,
    };
    const existing: Offer = { ...candidate, id: 'x', details: known, firstSeen: now.toISOString(), lastSeen: now.toISOString() };
    const [merged] = mergeOffers([existing], [candidate], { now, steamChecked: new Set() });
    assert.deepEqual(merged?.details, known);
  });
});
