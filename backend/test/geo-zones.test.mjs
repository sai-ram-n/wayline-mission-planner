/**
 * GEO Zone / Task Area overlays — repository-level test against a throwaway
 * SQLite database.
 *
 *   cd backend && npm test
 *
 * DATA_DIR is set to a temp directory before db.js is ever imported (see
 * merge.test.mjs for why), so this never touches backend/data/wayline.sqlite.
 * The live end-to-end path (create, too-few-vertices -> 400, list, delete,
 * delete-missing -> 404) was already verified once against a running server;
 * this pins the same contract at the repository layer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'wmp-geo-zones-test-'));

const { createGeoZone, deleteGeoZone, listGeoZones } = await import('../repository.js');
const { geoZoneCreateSchema } = await import('../schemas.js');

test.after(() => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

test('a GEO Zone round-trips through create/list/delete', () => {
  const input = geoZoneCreateSchema.parse({
    name: 'No-Fly Strip',
    vertices: [
      { lat: 1, lng: 1 },
      { lat: 1, lng: 2 },
      { lat: 2, lng: 2 },
    ],
  });
  assert.equal(input.kind, 'geo_zone', 'kind defaults to geo_zone');

  const id = createGeoZone(input);
  const [found] = listGeoZones();
  assert.equal(found.id, id);
  assert.equal(found.name, 'No-Fly Strip');
  assert.equal(found.kind, 'geo_zone');
  assert.equal(found.vertices.length, 3);

  assert.equal(deleteGeoZone(id), true);
  assert.deepEqual(listGeoZones(), []);
  assert.equal(deleteGeoZone(id), false);
});

test('a task_area kind is preserved when explicitly set', () => {
  const input = geoZoneCreateSchema.parse({
    name: 'Survey Block',
    kind: 'task_area',
    vertices: [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 },
    ],
  });
  const id = createGeoZone(input);
  assert.equal(listGeoZones().find((z) => z.id === id).kind, 'task_area');
  deleteGeoZone(id);
});

test('fewer than 3 vertices is rejected by the schema', () => {
  assert.throws(() =>
    geoZoneCreateSchema.parse({ name: 'Too small', vertices: [{ lat: 0, lng: 0 }] })
  );
});
