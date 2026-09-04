/**
 * Route-settings schema passthrough.
 *
 *   cd backend && npm test
 *
 * `settingsSchema` is declared `.passthrough()` so route-level extras (like the
 * M4D/M4E series accessory selection) can ride inside `settings` without a
 * database migration. This pins that contract down so a future tightening of
 * the schema doesn't silently start stripping it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { settingsSchema, waylineCreateSchema } from '../schemas.js';

test('settingsSchema passes an accessories list through unchanged', () => {
  const parsed = settingsSchema.parse({
    autoFlightSpeed: 10,
    accessories: ['AS1 Speaker', 'AL1 SpotLight'],
  });
  assert.deepEqual(parsed.accessories, ['AS1 Speaker', 'AL1 SpotLight']);
});

test('a full wayline create payload keeps the accessories list inside settings', () => {
  const parsed = waylineCreateSchema.parse({
    name: 'Test route',
    aircraft_series: 'M4D',
    aircraft_model: 'M4D',
    settings: { accessories: ['AS1 Speaker'] },
  });
  assert.deepEqual(parsed.settings.accessories, ['AS1 Speaker']);
});
