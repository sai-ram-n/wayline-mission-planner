/**
 * Free-standing map annotations — repository-level test against a throwaway
 * SQLite database.
 *
 *   cd backend && npm test
 *
 * DATA_DIR is set to a temp directory before db.js is ever imported (see
 * merge.test.mjs for why), so this never touches backend/data/wayline.sqlite.
 * The live end-to-end path (create point/circle, list, invalid kind -> 400,
 * delete, delete-missing -> 404) was already verified once against a running
 * server; this pins the same contract at the repository layer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'wmp-annotations-test-'));

const { createAnnotation, deleteAnnotation, listAnnotations } = await import('../repository.js');
const { annotationCreateSchema } = await import('../schemas.js');

test.after(() => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

test('a point annotation round-trips through create/list/delete', () => {
  const input = annotationCreateSchema.parse({
    kind: 'point',
    label: 'Hazard',
    geometry: { lat: 1, lng: 2 },
  });
  const id = createAnnotation(input);

  const [found] = listAnnotations();
  assert.equal(found.id, id);
  assert.equal(found.kind, 'point');
  assert.equal(found.label, 'Hazard');
  assert.equal(found.color, '#2d8cf0');
  assert.deepEqual(found.geometry, { lat: 1, lng: 2 });

  assert.equal(deleteAnnotation(id), true);
  assert.deepEqual(listAnnotations(), []);
  assert.equal(deleteAnnotation(id), false);
});

test('a circle annotation keeps its centre and radius', () => {
  const input = annotationCreateSchema.parse({
    kind: 'circle',
    geometry: { center: { lat: 10, lng: 20 }, radiusMeters: 150 },
  });
  const id = createAnnotation(input);
  const found = listAnnotations().find((a) => a.id === id);
  assert.deepEqual(found.geometry, { center: { lat: 10, lng: 20 }, radiusMeters: 150 });
  deleteAnnotation(id);
});

test('an invalid kind is rejected by the schema before it reaches the repository', () => {
  assert.throws(() => annotationCreateSchema.parse({ kind: 'triangle', geometry: { lat: 1, lng: 2 } }));
});

test('a rectangle geometry (two opposite corners) round-trips', () => {
  const input = annotationCreateSchema.parse({
    kind: 'rectangle',
    geometry: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }],
  });
  const id = createAnnotation(input);
  const found = listAnnotations().find((a) => a.id === id);
  assert.deepEqual(found.geometry, [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }]);
  deleteAnnotation(id);
});
