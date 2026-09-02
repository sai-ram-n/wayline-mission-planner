# Progress Log

Running project memory. **Read this file before starting any phase.** Update it after finishing
one, recording what was built, key decisions, deviations, and what's next.

---

## Project summary

Build a full-stack, locally-runnable drone mission planner — create a mission on a map, configure
waypoints and actions, save it as a named wayline, browse/edit saved waylines in a library, and
assign a wayline to one or more drones. Free/open-source stack only.

`docs/feature-reference.md` is the spec. It was written from direct exploration of a live DJI
FlightHub 2 Wayline module and is the authority on what to build — not general knowledge of DJI
products.

**Branch:** `dev`. Each phase is tested, then committed and pushed on its own.

---

## Standing decisions

| Decision | Rationale |
|---|---|
| Route types: **Waypoint, Area, Linear** only | Confirmed with the user. Fully documented in the feature reference; the other four appear in the Create dialog as visibly unsupported. |
| **KMZ import *and* export**, real DJI WPML 1.0.6 | The exploration yielded the exact schema (feature-reference §7), so the app can produce genuinely flyable files rather than an invented format. |
| Drone assignment follows the **project brief's fallback spec**, not FlightHub | FlightHub's fleet and task modules were never explored (feature-reference §10). Guessing would violate the "don't guess" rule, so this feature is presented as our own design. |
| Waypoints are added by **clicking the map**, not by FlightHub's virtual-flight mode | FlightHub adds waypoints at a 3D virtual aircraft's position via `Space`. We have no 3D terrain service, so we use the conventional click/drag pattern while keeping identical waypoint fields and actions. Recorded in feature-reference §4. |
| SQLite schema mirrors WPML field names where practical | Keeps KMZ round-trips lossless. |
| Single root `version.js`, bumped by `scripts/bump-version.mjs` every phase commit | Per the brief's requirement to maintain a date and version JS file. |

---

## Phase status

| # | Phase | Status |
|---|---|---|
| 0 | Feature reference + project scaffold | ✅ Complete |
| 1 | Backend scaffold + DB schema + REST API | ✅ Complete |
| 2 | Frontend scaffold + routing + store | ✅ Complete |
| 3 | Waypoint editor — map canvas | ⬜ Not started |
| 4 | Waypoint settings + action editing | ⬜ Not started |
| 5 | Area + Linear route generation | ⬜ Not started |
| 6 | Wayline library | ⬜ Not started |
| 7 | Drone fleet + assignment | ⬜ Not started |
| 8 | KMZ import/export + polish | ⬜ Not started |

---

## Phase 0 — Feature reference and project scaffold ✅

**Date:** 2026-09-01 · **Version:** 0.1.0

### What was built
- `docs/feature-reference.md` — the Step 1 deliverable. Eleven sections covering route types and
  the aircraft-compatibility matrix, the library, editor chrome and keyboard map, waypoint
  authoring, global settings with real defaults and enums, the full action catalogue with verified
  parameter editors, the complete WPML/KMZ data model, the Area/Linear/Patrol settings panels, a
  consolidated Matrice 30T section, an explicit *not explored* section, and the feature set we will
  build.
- `docs/progress-log.md` — this file.
- `version.js` (root) + `scripts/bump-version.mjs`.
- `.gitignore`, directory skeleton, README.

### How the reference was produced
Live exploration of the FlightHub 2 Wayline module. Four waylines were created and exercised:
`WMP-A-M30T-Waypoint-Full` (Matrice 30T, 12 waypoints, ~20 actions — used to click through every
waypoint and action control), `WMP-B-M30T-Area-Mapping`, `WMP-C-Mavic3T-Linear-Strip`, and
`WMP-D-M4T-Patrol`. The data model was obtained by fetching a saved route's `.kmz` from the CDN and
inflating it in-page, giving exact element names, enums and defaults rather than guesses.

### Key findings that shape the build
1. A wayline **is** a KMZ of two XML files — so KMZ is the natural interchange format, not an
   afterthought.
2. Route type constrains which aircraft are selectable (matrix in §1).
3. Actions have real **state-machine constraints** — Take Photo will not attach while a
   `Start Recording` is live earlier in the route. Verified by experiment, not assumed.
4. The **Photos** and **Flight Duration** stats are derived live from interval and hover actions.
5. Matrice 30T is a three-sensor aircraft (WIDE/Zoom/IR) on waypoint routes but only WIDE/IR on
   area routes, and uniquely exposes Smart Low-Light.

### Deviations from the original plan
- None yet. The brief's fallback spec was extended (not replaced) where the live site showed richer
  behaviour — chiefly the settings model, the action catalogue and the KMZ format.

### Notes / risks
- The KMZ fixture pulled from the live site is an *empty* route (zero waypoints), so it only
  exercises the mission-config half of the parser. Phase 8 must hand-author a multi-waypoint
  fixture from the §7 schema to test placemarks and action groups properly.
- The live-site exploration is finished; no further browsing is planned. Any gap must be resolved
  from `docs/feature-reference.md` or flagged, never guessed.

### Next
**Phase 1** — backend scaffold: Express + better-sqlite3, schema init and drone seed, waylines /
drones / assignments / folders routes with Zod validation and transactional nested writes.

---

## Phase 1 — Backend scaffold, DB schema and REST API ✅

**Date:** 2026-09-01 · **Version:** 0.2.0

### What was built
- `db.js` — SQLite (WAL, foreign keys on) with `folders`, `waylines`, `waypoints`,
  `waypoint_actions`, `drones`, `assignments`, plus indexes. Schema created on first run and
  seeded with a Default Folder and a four-aircraft mock fleet including two Matrice 30T.
- `constants.js` — the domain model lifted from `feature-reference.md`: route types, the aircraft
  catalogue with WPML `droneEnumValue`s, the route-type/aircraft compatibility matrix, all global
  setting enums with their display labels, the 14-entry action catalogue with WPML actuator
  mappings, and the observed defaults.
- `schemas.js` — Zod schemas for every write, with real bounds (speed 1–15 m/s, altitude
  −200–1500 m, headings ±180°).
- `repository.js` — nested reads and **transactional** nested writes; update deletes and reinserts
  waypoints (actions cascade) inside one transaction.
- `middleware.js` — async wrapper, Zod validation, 404 and error handlers.
- Routes: `waylines` (list with query filters, get, create, update, patch, duplicate, delete),
  `folders` (recursive delete), `drones`, `assignments` (multi-drone create, status advance).
- `server.js` — helmet, cors, `/api/health`, and `/api/meta` which serves the whole enum/label/
  default set so the frontend renders its dropdowns from one shared source.
- `backend/test/api-smoke.sh` — end-to-end smoke test covering the whole surface.

### Key decisions
- **`/api/meta`** exists so the domain model lives in one place. The frontend must not restate
  enums or labels.
- **Lock is only settable via `PATCH`**, never `PUT`. See the bug below.
- Added `PATCH /api/waylines/:id` for name/description/folder/lock. This backs the library's
  Rename / Move / Lock card actions without rewriting the route contents.
- `settings` is merged over `DEFAULT_SETTINGS` on read, so a partially-specified wayline always
  comes back complete.

### Bug found and fixed during testing
`locked` was declared on the update schema with `.default(false)`. Every `PUT` therefore carried
`locked: false`, so the guard `existing.locked && req.body.locked !== false` never fired — a
routine save silently unlocked the wayline, after which delete also succeeded. Locking protected
nothing. Fixed by omitting `locked` from the update schema entirely and moving lock changes to
`PATCH`; `PUT` now preserves the stored value and returns 409 while locked. Re-verified: PUT,
PATCH and DELETE all return 409 on a locked wayline, the record survives byte-for-byte, and
unlocking then editing works.

### Verified
Full lifecycle create → read → update → duplicate → delete with nested waypoints and actions;
per-waypoint override flags persist; no orphaned action rows after an update (checked in SQL);
validation rejects out-of-range coordinates, unknown action types, blank names and over-limit
speeds with field-level messages; 404s; multi-drone assignment and the pending → synced →
in_progress → complete progression; assignment rows cascade away with their wayline.

### Deviations from plan
- Added `PATCH /api/waylines/:id` and `/api/meta`, neither in the original API list. Both earned
  their place — see decisions above.
- KMZ routes deferred to Phase 8 as planned; `jszip` and `fast-xml-parser` are installed and
  `fast-xml-parser` was pinned to v5 to clear a moderate advisory (`npm audit`: 0 vulnerabilities).

### Next
**Phase 2** — frontend scaffold: Vite + React + Tailwind, react-router for `/editor`, `/library`
and `/drones`, the axios client, the Zustand mission store, and the app shell.

---

## Phase 2 — Frontend scaffold, routing and store ✅

**Date:** 2026-09-02 · **Version:** 0.3.0

### What was built
- Vite + React + Tailwind, with a dark control-room palette (the map is the brightest thing on
  screen, so the chrome stays dark) and reusable `.panel` / `.btn` / `.input` component classes.
- `vite.config.js` — `@` and `@version` aliases, `fs.allow: ['..']` so the root `version.js` can be
  imported, and an `/api` proxy to port 3001 so the browser needs no CORS or base URL.
- `api.js` — axios client with an interceptor that turns backend failures into readable messages,
  expanding Zod `details` into `field: message` text instead of "Request failed with status 400".
- `store.js` — Zustand mission store: the mission being edited, dirty/loading/saving flags,
  waypoint and action CRUD, selection state, a 50-step undo history, and `saveMission` which
  creates or updates depending on whether the mission has an id. New waypoints auto-attach the four
  attitude actions when `syncAttitudeOnNewWaypoint` is set, mirroring the reference behaviour.
- `AppShell` with Editor / Library / Fleet navigation and a version badge; shared `Spinner`,
  `ErrorBanner` and `EmptyState`; placeholder pages for the three routes.
- `App.jsx` fetches `/api/meta` once at startup and shows a clear "start the backend" message if
  the API is unreachable.

### Key decisions
- The frontend never restates enums or labels — they all come from `/api/meta`, fetched once.
- Client-side ids (`local-…`) are assigned to unsaved waypoints and actions for React keys, and
  stripped before the payload is sent so the server owns real ids.
- Dragging a marker calls `moveWaypoint`, which deliberately does *not* push undo history; only
  discrete edits do, so undo isn't flooded by drag frames.

### Deviations from plan
- Upgraded Vite 5 → 8 and react-router-dom 6 → 7 to clear two moderate npm advisories (esbuild
  dev-server request forgery; react-router open redirect). `npm audit` is clean on both packages.
- `server.host` defaults to `127.0.0.1` with a `VITE_HOST` override. Vite was binding `[::1]` only,
  which some browsers cannot reach on `localhost`.

### Verified
Production build succeeds (97 modules). Dev server serves the app, the `/api` proxy reaches the
backend, all three routes render, nav active state is correct, and the console is free of errors.

### Incident
While restarting the dev server I ran `pkill -f "vite"`, which killed three unrelated Vite dev
servers belonging to other projects on this machine (ports 5173–5175). They could not be restored.
All process management is now scoped to the project path
(`pkill -f "wayline-mission-planner/frontend/…"`).

### Notes
The Chrome instance used for UI checks is in a different network namespace and cannot reach this
host's loopback, so the dev server is started with `VITE_HOST=0.0.0.0` and viewed over the LAN
address when a visual check is needed. Default remains loopback-only.

### Next
**Phase 3** — waypoint editor map canvas: react-leaflet with OSM tiles, click-to-add waypoints,
draggable markers, the waypoint list with drag-reorder, and the live stats bar via Turf.
