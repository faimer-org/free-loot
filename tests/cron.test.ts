import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldDispatch } from '../cron/schedule.ts';

// Les quatre exécutions du Cron Trigger (5, 6, 15, 16 h 45 UTC) d'un jour donné.
const runs = (day: string) =>
  [5, 6, 15, 16].map((h) => new Date(`${day}T${String(h).padStart(2, '0')}:45:00Z`));

test('hiver (UTC+1) : seules 6 h 45 et 16 h 45 UTC déclenchent', () => {
  assert.deepEqual(runs('2026-11-16').map(shouldDispatch), [false, true, false, true]);
});

test('été (UTC+2) : seules 5 h 45 et 15 h 45 UTC déclenchent', () => {
  assert.deepEqual(runs('2026-07-15').map(shouldDispatch), [true, false, true, false]);
});

test("jours de changement d'heure", () => {
  // Heure d'été le 29 mars 2026 à 1 h UTC, retour à l'heure d'hiver le 25 octobre 2026 à 1 h UTC.
  assert.deepEqual(runs('2026-03-29').map(shouldDispatch), [true, false, true, false]);
  assert.deepEqual(runs('2026-10-25').map(shouldDispatch), [false, true, false, true]);
});
