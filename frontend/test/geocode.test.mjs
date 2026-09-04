/**
 * Map search URL-building and result-parsing (lib/geocode.js).
 *
 *   cd frontend && npm test
 *
 * The actual `fetch` call lives in MapCanvas.jsx's MapSearchBox and is
 * deliberately not exercised here — these are the pure, network-free halves
 * the fetch wraps.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSearchUrl, parseSearchResults } from '../src/lib/geocode.js';

test('buildSearchUrl encodes the query against the Nominatim search endpoint', () => {
  const url = buildSearchUrl('Warehouse District, Springfield');
  assert.ok(url.startsWith('https://nominatim.openstreetmap.org/search?'));
  const params = new URL(url).searchParams;
  assert.equal(params.get('q'), 'Warehouse District, Springfield');
  assert.equal(params.get('format'), 'json');
  assert.equal(params.get('limit'), '5');
});

test('buildSearchUrl honours a custom limit', () => {
  const url = buildSearchUrl('Springfield', { limit: 1 });
  assert.equal(new URL(url).searchParams.get('limit'), '1');
});

test('parseSearchResults extracts label/lat/lng from Nominatim rows', () => {
  const results = parseSearchResults([
    { display_name: 'Springfield, IL, USA', lat: '39.7817', lon: '-89.6501' },
    { display_name: 'Springfield, MA, USA', lat: '42.1015', lon: '-72.5898' },
  ]);
  assert.deepEqual(results, [
    { label: 'Springfield, IL, USA', lat: 39.7817, lng: -89.6501 },
    { label: 'Springfield, MA, USA', lat: 42.1015, lng: -72.5898 },
  ]);
});

test('parseSearchResults drops rows with missing or invalid coordinates', () => {
  const results = parseSearchResults([
    { display_name: 'No coordinates' },
    { display_name: 'Bad lat', lat: 'not-a-number', lon: '1' },
    { display_name: '', lat: '1', lon: '1' },
    { display_name: 'Valid', lat: '1', lon: '2' },
  ]);
  assert.deepEqual(results, [{ label: 'Valid', lat: 1, lng: 2 }]);
});

test('parseSearchResults tolerates a non-array response instead of throwing', () => {
  assert.deepEqual(parseSearchResults(null), []);
  assert.deepEqual(parseSearchResults({ error: 'rate limited' }), []);
});
