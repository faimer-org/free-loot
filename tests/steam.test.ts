import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { classifySteamItem, coverImage, type ClassifyContext } from '../collector/steam/classify.ts';
import type { StoreItem } from '../collector/steam/storeBrowse.ts';

// Réponse réelle de GetItems (2026-11-14) : Euro Truck Simulator 2, un de ses DLC, Portal 2.
const realItems = (): StoreItem[] =>
  JSON.parse(readFileSync(new URL('./fixtures/steam-getitems-2026-11-14.json', import.meta.url), 'utf-8')).response
    .store_items;

const item = (appid: number): StoreItem => {
  const found = realItems().find((candidate) => candidate.id === appid);
  assert.ok(found);
  return found;
};

const now = new Date('2026-11-14T12:00:00Z');
const context = (priceChanged = false): ClassifyContext => ({ now, priceChangedSinceLastRun: () => priceChanged });

/** Transforme une app réelle en offre gratuite à durée limitée (forme observée sur une remise de 75 %). */
function freeToKeep(base: StoreItem, endDate = 1_795_539_600): StoreItem {
  return {
    ...base,
    best_purchase_option: {
      packageid: 1,
      final_price_in_cents: '0',
      original_price_in_cents: '1999',
      discount_pct: 100,
      active_discounts: [{ discount_amount: '1999', discount_end_date: endDate }],
    },
  };
}

describe('classifySteamItem', () => {
  it('ignore un jeu au prix normal', () => {
    assert.equal(classifySteamItem(item(620), context()), null);
  });

  it('ignore une remise partielle', () => {
    const discounted = {
      ...item(227300),
      best_purchase_option: {
        final_price_in_cents: '499',
        original_price_in_cents: '1999',
        discount_pct: 75,
        active_discounts: [{ discount_end_date: 1_795_539_600 }],
      },
    };
    assert.equal(classifySteamItem(discounted, context()), null);
  });

  it('détecte un Free to Keep et sa date de fin', () => {
    const result = classifySteamItem(freeToKeep(item(227300)), context());
    assert.equal(result?.offer.type, 'free_to_keep');
    assert.equal(result?.offer.title, 'Euro Truck Simulator 2');
    assert.equal(result?.offer.originalPrice, 1999);
    assert.equal(result?.offer.endDate, '2026-11-24T17:00:00.000Z');
    assert.equal(result?.offer.url, 'https://store.steampowered.com/app/227300/');
    assert.equal(result?.offer.isDlc, false);
  });

  it('signale un DLC et l’appid de son jeu de base', () => {
    const result = classifySteamItem(freeToKeep(item(3809270)), context());
    assert.equal(result?.offer.isDlc, true);
    assert.equal(result?.parentAppid, 227300);
    assert.equal(result?.offer.baseGame?.url, 'https://store.steampowered.com/app/227300/');
  });

  it('ignore les démos', () => {
    assert.equal(classifySteamItem({ ...freeToKeep(item(620)), type: 1 }, context()), null);
  });

  it('détecte un Free Weekend', () => {
    const weekend = { ...item(620), free_weekend: { start_time: 1_794_675_600, end_time: 1_794_934_800 } };
    const result = classifySteamItem(weekend, context());
    assert.equal(result?.offer.type, 'free_weekend');
    assert.equal(result?.offer.startDate, '2026-11-14T17:00:00.000Z');
    assert.equal(result?.offer.endDate, '2026-11-17T17:00:00.000Z');
    assert.equal(result?.offer.originalPrice, 969);
  });

  it('donne le prix d’origine d’un Free Weekend accompagné d’une remise', () => {
    // Forme observée le 2026-11-14 sur Company of Heroes 3 (1677280).
    const weekend = {
      ...item(620),
      best_purchase_option: { final_price_in_cents: '1814', original_price_in_cents: '5499', discount_pct: 67 },
      free_weekend: { start_time: 1_794_506_400, end_time: 1_794_852_000 },
    };
    assert.equal(classifySteamItem(weekend, context())?.offer.originalPrice, 5499);
  });

  it('ignore un Free Weekend terminé', () => {
    const weekend = { ...item(620), free_weekend: { start_time: 1_794_000_000, end_time: 1_794_100_000 } };
    assert.equal(classifySteamItem(weekend, context()), null);
  });

  it('détecte un jeu devenu gratuit seulement si son prix vient de changer', () => {
    const free = { ...item(620), is_free: true, best_purchase_option: undefined };
    assert.equal(classifySteamItem(free, context(false)), null);
    assert.equal(classifySteamItem(free, context(true))?.offer.type, 'now_free');
  });

  it('ne prend pas un free-to-play récent pour un jeu devenu gratuit', () => {
    const recent = {
      ...item(620),
      is_free: true,
      best_purchase_option: undefined,
      release: { steam_release_date: 1_793_000_000 },
    };
    assert.equal(classifySteamItem(recent, context(true)), null);
  });
});

describe('coverImage', () => {
  it('préfère la jaquette verticale', () => {
    assert.equal(
      coverImage(item(227300)),
      'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/227300/library_600x900.jpg?t=1794502925',
    );
  });

  it('se rabat sur l’en-tête pour un DLC', () => {
    assert.equal(
      coverImage(item(3809270)),
      'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3809270/76265f5ca82a7e38ef486f169108f08379785a51/header.jpg?t=1794576017',
    );
  });
});
