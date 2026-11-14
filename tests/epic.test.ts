import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parseEpic, titleFromSlug, type EpicResponse } from '../collector/epic.ts';

const fixture = (): EpicResponse =>
  JSON.parse(readFileSync(new URL('./fixtures/epic-2026-11-14.json', import.meta.url), 'utf-8'));

describe('parseEpic (réponse réelle du 2026-11-14)', () => {
  const offers = parseEpic(fixture());

  it('ne garde que les promotions gratuites, en cours et à venir', () => {
    assert.deepEqual(offers.map((o) => o.title).sort(), ['Alien: Isolation', 'Knightica', 'Mark of the Deep']);
  });

  it('décrit l’offre en cours', () => {
    const knightica = offers.find((o) => o.title === 'Knightica');
    assert.deepEqual(knightica, {
      store: 'epic',
      storeId: knightica?.storeId,
      type: 'free_to_keep',
      title: 'Knightica',
      isDlc: false,
      baseGame: null,
      originalPrice: 1349,
      currency: 'EUR',
      startDate: '2026-11-12T16:00:00.000Z',
      endDate: '2026-11-19T16:00:00.000Z',
      url: 'https://store.epicgames.com/fr/p/knightica-3be45c',
      image: 'https://cdn1.epicgames.com/spt-assets/357100ca5613420e98208c5f14585e9d/knightica-1xc3d.png',
      details: knightica?.details, // vérifiés dans details.test.ts
    });
  });

  it('date les offres à venir', () => {
    const alien = offers.find((o) => o.title === 'Alien: Isolation');
    assert.equal(alien?.startDate, '2026-11-19T16:00:00.000Z');
    assert.equal(alien?.url, 'https://store.epicgames.com/fr/p/alien-isolation');
  });
});

describe('parseEpic (DLC)', () => {
  it('signale le DLC et son jeu de base', () => {
    const json = fixture();
    const elements = json.data.Catalog.searchStore.elements;
    const addOn = elements.find((e) => e.offerType === 'ADD_ON');
    assert.ok(addOn);
    addOn.promotions = {
      promotionalOffers: [
        {
          promotionalOffers: [
            {
              startDate: '2026-11-12T16:00:00.000Z',
              endDate: '2026-11-19T16:00:00.000Z',
              discountSetting: { discountType: 'PERCENTAGE', discountPercentage: 0 },
            },
          ],
        },
      ],
      upcomingPromotionalOffers: [],
    };
    json.data.Catalog.searchStore.elements = [addOn];

    const [offer] = parseEpic(json);
    assert.equal(offer?.isDlc, true);
    assert.deepEqual(offer?.baseGame, { title: 'Lost Castle', url: 'https://store.epicgames.com/fr/p/lost-castle-abb2e2' });
    assert.equal(offer?.url, 'https://store.epicgames.com/fr/p/lost-castle-lost-castle-the-old-ones-awaken-db1545');
  });

  it('ignore une remise partielle', () => {
    const json = fixture();
    const ghostrunner = json.data.Catalog.searchStore.elements.filter((e) => e.title === 'Ghostrunner 2');
    json.data.Catalog.searchStore.elements = ghostrunner;
    assert.deepEqual(parseEpic(json), []);
  });
});

describe('titleFromSlug', () => {
  it('retire le suffixe hexadécimal', () => {
    assert.equal(titleFromSlug('lost-castle-abb2e2'), 'Lost Castle');
    assert.equal(titleFromSlug('alien-isolation'), 'Alien Isolation');
  });
});
