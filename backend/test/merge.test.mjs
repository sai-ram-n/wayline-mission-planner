/**
 * mergeWaylines — repository-level test against a throwaway SQLite database.
 *
 *   cd backend && npm test
 *
 * DATA_DIR is set to a temp directory before db.js is ever imported (via a
 * dynamic import, since static imports are hoisted), so this never touches
 * backend/data/wayline.sqlite. The live end-to-end path (create -> merge ->
 * get -> mixed-route-type 422 -> cleanup) was already verified once against
 * a running server; this test pins the same contract at the repository layer
 * so it's covered by `npm test` going forward.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'wmp-merge-test-'));

const { createWayline, getWayline, mergeWaylines } = await import('../repository.js');

test.after(() => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

test('merging concatenates waypoints and keeps the first route\'s settings', () => {
  const a = createWayline({
    name: 'Route A',
    route_type: 'waypoint',
    aircraft_series: 'M4D',
    aircraft_model: 'M4D',
    settings: { autoFlightSpeed: 8 },
    waypoints: [{ lat: 1, lng: 1, height: 100, actions: [] }],
  });
  const b = createWayline({
    name: 'Route B',
    route_type: 'waypoint',
    settings: { autoFlightSpeed: 12 },
    waypoints: [
      { lat: 2, lng: 2, height: 110, actions: [] },
      { lat: 3, lng: 3, height: 120, actions: [] },
    ],
  });

  const result = mergeWaylines([a, b], 'Merged Route');
  assert.equal(result.error, undefined);

  const merged = getWayline(result.id);
  assert.equal(merged.name, 'Merged Route');
  assert.equal(merged.waypoints.length, 3);
  assert.deepEqual(
    merged.waypoints.map((w) => [w.lat, w.lng]),
    [[1, 1], [2, 2], [3, 3]]
  );
  // First route's settings and aircraft win.
  assert.equal(merged.settings.autoFlightSpeed, 8);
  assert.equal(merged.aircraft_model, 'M4D');
});

test('merging routes of different types is rejected', () => {
  const a = createWayline({ name: 'WP', route_type: 'waypoint', waypoints: [] });
  const b = createWayline({ name: 'Area', route_type: 'area', waypoints: [] });

  const result = mergeWaylines([a, b]);
  assert.equal(result.error, 'mixed_route_types');
});

test('merging fewer than 2 existing routes is rejected', () => {
  const a = createWayline({ name: 'Solo', route_type: 'waypoint', waypoints: [] });
  assert.equal(mergeWaylines([a]).error, 'not_found');
  assert.equal(mergeWaylines([a, 'does-not-exist']).error, 'not_found');
});
