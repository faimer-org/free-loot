import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DetectedOffer, Offer } from '../collector/offer.ts';
import { appendHistory, mergeOffers, splitArchived, type HistoryFile } from '../collector/state.ts';
import { offerStatus } from '../site/js/status.js';

const now = new Date('2026-11-14T12:00:00Z');

const steamOffer = (overrides: Partial<DetectedOffer> = {}): DetectedOffer => ({
  store: 'steam',
  storeId: '227300',
  type: 'free_to_keep',
  title: 'Euro Truck Simulator 2',
  isDlc: false,
  baseGame: null,
  originalPrice: 1999,
  currency: 'EUR',
  startDate: null,
  endDate: '2026-11-20T17:00:00.000Z',
  url: 'https://store.steampowered.com/app/227300/',
  image: null,
  ...overrides,
});

const epicOffer = (overrides: Partial<DetectedOffer> = {}): DetectedOffer => ({
  ...steamOffer(),
  store: 'epic',
  storeId: 'ns:abc',
  title: 'Knightica',
  startDate: '2026-11-12T16:00:00.000Z',
  endDate: '2026-11-19T16:00:00.000Z',
  ...overrides,
});

const known = (offer: DetectedOffer, seen: string, id = 'known'): Offer => ({
  id,
  ...offer,
  firstSeen: seen,
  lastSeen: seen,
});

describe('mergeOffers', () => {
  it('ajoute une nouvelle offre', () => {
    const [offer] = mergeOffers([], [steamOffer()], { now, steamChecked: new Set() });
    assert.equal(offer?.id, 'steam-227300-free_to_keep-2026-11-14');
    assert.equal(offer?.firstSeen, now.toISOString());
  });

  it('met à jour une offre connue sans changer sa première détection', () => {
    const existing = known(steamOffer(), '2026-11-13T06:00:00.000Z');
    const [offer] = mergeOffers([existing], [steamOffer({ endDate: '2026-11-21T17:00:00.000Z' })], {
      now,
      steamChecked: new Set([227300]),
    });
    assert.equal(offer?.id, 'known');
    assert.equal(offer?.firstSeen, '2026-11-13T06:00:00.000Z');
    assert.equal(offer?.lastSeen, now.toISOString());
    assert.equal(offer?.endDate, '2026-11-21T17:00:00.000Z');
  });

  it('met à jour la remise d’un Free Weekend, puis la retire quand elle se termine', () => {
    const weekend = (discount: DetectedOffer['discount']) =>
      steamOffer({ type: 'free_weekend', storeId: '1677280', startDate: '2026-11-12T18:00:00.000Z', discount });
    const options = { now, steamChecked: new Set([1677280]) };

    // Offre enregistrée avant l'ajout du champ : pas de clé `discount`.
    const { discount: _, ...legacy } = weekend(null);
    const [first] = mergeOffers([known(legacy, '2026-11-13T06:00:00.000Z')], [
      weekend({ price: 1814, percent: 67, endDate: '2026-11-19T18:00:00.000Z' }),
    ], options);
    assert.deepEqual(first?.discount, { price: 1814, percent: 67, endDate: '2026-11-19T18:00:00.000Z' });

    const [second] = mergeOffers([first!], [weekend({ price: 2749, percent: 50, endDate: null })], options);
    assert.deepEqual(second?.discount, { price: 2749, percent: 50, endDate: null });

    const [third] = mergeOffers([second!], [weekend(null)], options);
    assert.equal(third?.id, 'known');
    assert.equal(third?.discount, null);
  });

  it('termine une offre Steam relue mais plus gratuite', () => {
    const existing = known(steamOffer(), '2026-11-13T06:00:00.000Z');
    const [offer] = mergeOffers([existing], [], { now, steamChecked: new Set([227300]) });
    assert.equal(offer?.endDate, now.toISOString());
    assert.equal(offerStatus(offer!, now.getTime()), 'expired');
  });

  it('ne termine pas une offre Steam non relue (erreur d’API)', () => {
    const existing = known(steamOffer(), '2026-11-13T06:00:00.000Z');
    const [offer] = mergeOffers([existing], [], { now, steamChecked: new Set() });
    assert.equal(offer?.endDate, '2026-11-20T17:00:00.000Z');
  });

  it('crée une nouvelle occurrence quand un jeu est offert de nouveau', () => {
    const past = known(steamOffer({ endDate: '2026-06-01T17:00:00.000Z' }), '2026-05-28T06:00:00.000Z');
    const offers = mergeOffers([past], [steamOffer()], { now, steamChecked: new Set([227300]) });
    assert.equal(offers.length, 2);
  });

  it('distingue deux promotions Epic du même jeu par leur date de début', () => {
    const existing = known(epicOffer(), '2026-11-12T17:00:00.000Z');
    const offers = mergeOffers([existing], [epicOffer(), epicOffer({ startDate: '2026-12-24T16:00:00.000Z' })], {
      now,
      steamChecked: new Set(),
    });
    assert.equal(offers.length, 2);
  });
});

describe('splitArchived / appendHistory', () => {
  it('archive les offres expirées depuis plus de 30 jours, par année de fin', () => {
    const old = known(steamOffer({ endDate: '2026-09-01T17:00:00.000Z' }), '2026-08-28T06:00:00.000Z', 'old');
    const recent = known(steamOffer({ endDate: '2026-11-01T17:00:00.000Z' }), '2026-10-28T06:00:00.000Z', 'recent');
    const { current, archived } = splitArchived([old, recent], now);
    assert.deepEqual(
      current.map((o) => o.id),
      ['recent'],
    );

    const files = new Map<number, HistoryFile>([[2026, { year: 2026, offers: [old] }]]);
    const years = appendHistory(
      archived,
      (year) => files.get(year) ?? { year, offers: [] },
      (file) => files.set(file.year, file),
    );
    assert.deepEqual(years, [2026]);
    assert.equal(files.get(2026)?.offers.length, 1, 'pas de doublon');
  });
});
