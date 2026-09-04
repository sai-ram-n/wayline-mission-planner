/**
 * Map search — feature-gap audit §"Map search tool" (DJI FlightHub's magnifying-
 * glass search box). Uses the public OpenStreetMap Nominatim geocoder: no new
 * dependency, and consistent with the OSM tile attribution already shown on the
 * map (lib/constants.js's TILE_LAYERS).
 *
 * URL-building and result-parsing are kept as pure functions, separate from the
 * `fetch` call itself, so they're unit-testable without hitting the network.
 */
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

/** The request URL for a free-text place search. */
export function buildSearchUrl(query, { limit = 5 } = {}) {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: String(limit),
  });
  return `${NOMINATIM_ENDPOINT}?${params.toString()}`;
}

/**
 * Normalise a Nominatim response into `{ label, lat, lng }` results, dropping
 * anything without valid coordinates rather than surfacing a broken result.
 */
export function parseSearchResults(json) {
  if (!Array.isArray(json)) return [];
  return json
    .map((item) => ({
      label: item?.display_name ?? '',
      lat: Number(item?.lat),
      lng: Number(item?.lon),
    }))
    .filter((result) => result.label && Number.isFinite(result.lat) && Number.isFinite(result.lng));
}
