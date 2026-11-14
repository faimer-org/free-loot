import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { offerStatus } from '../site/js/status.js';
import { mergeDetails } from './details.ts';
import type { DetectedOffer, Offer } from './offer.ts';

const DAY = 86_400_000;
/** Une offre expirée reste dans offers.json ce nombre de jours, puis passe dans l'historique. */
export const KEEP_EXPIRED_DAYS = 30;

const root = new URL('../', import.meta.url);
export const PATHS = {
  state: fileURLToPath(new URL('data/state.json', root)),
  offers: fileURLToPath(new URL('site/data/offers.json', root)),
  history: (year: number) => fileURLToPath(new URL(`site/data/history/${year}.json`, root)),
};

/** État interne entre deux exécutions (non publié). */
export interface State {
  version: 1;
  steam: {
    /** Dernière lecture réussie de GetAppList. */
    lastRun: string | null;
    maxPriceChange: number;
  };
}

/** Fichier publié et lu par la page. */
export interface OffersFile {
  generatedAt: string;
  historyYears: number[];
  offers: Offer[];
}

export interface HistoryFile {
  year: number;
  offers: Offer[];
}

export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

export function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

export const emptyState = (): State => ({ version: 1, steam: { lastRun: null, maxPriceChange: 0 } });
export const emptyOffers = (): OffersFile => ({ generatedAt: '', historyYears: [], offers: [] });

export interface MergeOptions {
  now: Date;
  /** Apps Steam lues pendant l'exécution : une offre Steam active non redétectée parmi elles est terminée. */
  steamChecked: Set<number>;
}

/**
 * Fusionne les offres détectées avec les offres connues.
 * - Epic : une occurrence est identifiée par le produit et sa date de début.
 * - Steam : une occurrence est l'offre encore active du même produit et du même type.
 */
export function mergeOffers(known: Offer[], detected: DetectedOffer[], { now, steamChecked }: MergeOptions): Offer[] {
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const offers = known.map((offer) => ({ ...offer }));
  const matched = new Set<Offer>();

  for (const candidate of detected) {
    const existing = offers.find(
      (offer) =>
        !matched.has(offer) &&
        offer.store === candidate.store &&
        offer.storeId === candidate.storeId &&
        offer.type === candidate.type &&
        (candidate.store === 'epic'
          ? offer.startDate === candidate.startDate
          : offerStatus(offer, nowMs) !== 'expired'),
    );

    if (existing) {
      Object.assign(existing, candidate, {
        // Steam ne donne pas de date de début pour un Free to Keep : on garde celle connue.
        startDate: candidate.startDate ?? existing.startDate,
        details: mergeDetails(existing.details, candidate.details),
        lastSeen: nowIso,
      });
      matched.add(existing);
    } else {
      const offer: Offer = {
        id: uniqueId(offers, candidate, nowIso),
        ...candidate,
        firstSeen: nowIso,
        lastSeen: nowIso,
      };
      offers.push(offer);
      matched.add(offer);
    }
  }

  // Offres Steam actives, relues mais plus gratuites : terminées maintenant.
  for (const offer of offers) {
    if (matched.has(offer) || offer.store !== 'steam') continue;
    if (!steamChecked.has(Number(offer.storeId))) continue;
    if (offerStatus(offer, nowMs) === 'expired') continue;
    offer.endDate = nowIso;
  }

  return offers.sort((a, b) => a.id.localeCompare(b.id));
}

function uniqueId(offers: Offer[], candidate: DetectedOffer, nowIso: string): string {
  const day = (candidate.startDate ?? nowIso).slice(0, 10);
  const base = `${candidate.store}-${candidate.storeId.replace(/[^A-Za-z0-9]+/g, '-')}-${candidate.type}-${day}`;
  let id = base;
  for (let n = 2; offers.some((offer) => offer.id === id); n++) id = `${base}-${n}`;
  return id;
}

/** Sépare les offres expirées depuis plus de KEEP_EXPIRED_DAYS jours, à archiver par année de fin. */
export function splitArchived(offers: Offer[], now: Date): { current: Offer[]; archived: Offer[] } {
  const limit = now.getTime() - KEEP_EXPIRED_DAYS * DAY;
  const current: Offer[] = [];
  const archived: Offer[] = [];
  for (const offer of offers) {
    const end = offer.endDate ? Date.parse(offer.endDate) : null;
    (end !== null && end < limit ? archived : current).push(offer);
  }
  return { current, archived };
}

/** Ajoute les offres archivées aux fichiers d'historique ; renvoie les années modifiées. */
export function appendHistory(
  archived: Offer[],
  read: (year: number) => HistoryFile,
  write: (file: HistoryFile) => void,
): number[] {
  const byYear = Map.groupBy(archived, (offer) => new Date(offer.endDate ?? offer.lastSeen).getUTCFullYear());
  for (const [year, offers] of byYear) {
    const file = read(year);
    const ids = new Set(offers.map((offer) => offer.id));
    file.offers = [...file.offers.filter((offer) => !ids.has(offer.id)), ...offers].sort((a, b) =>
      (a.endDate ?? '').localeCompare(b.endDate ?? ''),
    );
    write(file);
  }
  return [...byYear.keys()];
}
