# KMZ test fixtures

## `reference-empty-route.kmz`

A genuine wayline export in DJI WPML 1.0.6 format, captured from a live wayline editor during the
Step 1 exploration documented in `docs/feature-reference.md`. The `wpml:author` element has been
replaced with a placeholder; no other bytes were altered.

It contains `wpmz/template.kml` and `wpmz/waylines.wpml` for a **Matrice 30T waypoint route with
zero waypoints**, so it exercises the `missionConfig` and `Folder` halves of the parser — the real
element names, enum values and defaults — but **not** `Placemark` or `actionGroup` parsing.

## `synthetic-waypoint-route.kmz`

Hand-authored in Phase 8 from the schema in `docs/feature-reference.md` §7 to cover what the
capture above cannot: multiple placemarks, per-waypoint override flags, and action groups spanning
every supported action type. Used for the export → import → export round-trip test.
