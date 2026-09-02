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
| 3 | Waypoint editor — map canvas | ✅ Complete |
| 4 | Waypoint settings + action editing | ✅ Complete |
| 5 | Area + Linear route generation | ✅ Complete |
| 6 | Wayline library | ✅ Complete |
| 7 | Drone fleet + assignment | ✅ Complete |
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

---

## Phase 3 — Waypoint editor, map canvas ✅

**Date:** 2026-09-02 · **Version:** 0.4.0

### What was built
- `components/editor/MapCanvas.jsx` — react-leaflet map on OpenStreetMap raster tiles (street and
  terrain basemaps, attribution rendered as the OSM tile policy requires). Numbered `divIcon`
  markers (`S` for the start, amber when selected), a casing + line polyline for the route,
  draggable markers, click-to-add, zoom / fit-to-route / basemap controls, and a placement-mode
  banner used when setting the reference takeoff point.
- `components/editor/WaypointList.jsx` — reorderable waypoint list with per-row action icons and
  a delete button.
- `components/editor/StatsBar.jsx` — Flight Distance / Flight Duration / Waypoints / Photos, with
  an optional Area metric for Phase 5.
- `components/editor/SaveMissionDialog.jsx` — name + description prompt on first save.
- `lib/geo.js` — Turf-backed distance, bearing and leg helpers, plus `computeStats` (an
  interval-shot state machine for the photo count, hover durations and stop penalties),
  formatters, `waypointBounds`, and `routeToSvgPath` for the Phase 6 library thumbnails.
- `pages/Editor.jsx` — full wiring: load by `:id` or start blank, toolbar (Save / Undo / Reverse /
  Clear), reference takeoff placement, toast, locked-wayline banner, and a `beforeunload` guard
  while there are unsaved changes.

### Key decisions
- **Reordering uses pointer events, not the HTML5 drag-and-drop API.** Native DnD is not
  keyboard-operable, does not work on touch, and cannot be driven by synthetic events. Rows are
  also focusable and respond to `Alt+ArrowUp` / `Alt+ArrowDown`, so reordering never requires a
  pointer.
- Marker drags update position without pushing undo history; only discrete edits do.

### Bugs found and fixed
- **Reorder applied twice.** The pointerup handler committed the move *inside* a `setState`
  updater. Updaters must be pure, and React StrictMode deliberately invokes them twice, so one
  drag produced two reorders and a history entry for a state that never existed on screen. The
  drag indices now live in refs, and the commit happens in the handler body. Re-verified: a
  drag of index 3 onto index 1 turns `A,B,C,D` into exactly `A,D,B,C`, and a single undo restores
  `A,B,C,D`.

### Verified
End-to-end in the browser against the live backend:
- Click-to-add places waypoints; each auto-attaches the four attitude actions.
- Marker drag moves a waypoint and the polyline and distance follow.
- Pointer drag-reorder and `Alt+Arrow` reorder both perform exactly one move.
- Delete, Reverse, Clear (with confirmation) and Undo all behave, including undo of a Clear.
- Reference takeoff placement consumes the map click instead of adding a waypoint.
- Save writes through: reloading the wayline returns 5 waypoints, 4 actions each, and the
  `takeOffRefPoint` intact. The dirty indicator clears on save.
- `beforeunload` blocks navigation while unsaved — confirmed by an actual blocked navigation.
- Production build succeeds (150 modules); browser console clean on both a saved and a blank
  mission.

### Next
**Phase 4** — per-waypoint settings panel and the action editor: the real enums and tooltip text
from feature-reference §5–§6, per-waypoint override toggles, the *Take Photo blocked while
recording* rule and the *Follow Route* lens-chip behaviour, built on RHF + Zod.

---

## Phase 4 — Waypoint settings and action editing ✅

**Date:** 2026-09-02 · **Version:** 0.5.0

### What was built
- `components/ui/Field.jsx` — the shared control vocabulary the reference panels use: number
  steppers with coarse/fine buttons (±1 / ±10 / ±100), slider + numeric pairs, segmented tabs,
  selects, toggles, multi-select chips, an info tooltip and a collapsible section.
- `components/editor/GlobalSettingsPanel.jsx` — every control from feature-reference §5 with its
  real default and enum: Camera Settings chips, Smart Low-Light, takeoff behaviour, Safe Takeoff
  Altitude, Waypoint Altitude Mode, Global Altitude and Flight Speed, and the Advanced group
  (Takeoff Speed, RTH altitude, Waypoint Type, Aircraft Yaw, Gimbal Control, Upon Completion,
  synchronize-attitude).
- `components/editor/WaypointPanel.jsx` — §11.2: altitude, speed, heading mode including Point of
  Interest with POI coordinates, turn mode, damping distance, straight-line, and the four
  *use route …* override toggles that map onto the WPML `useGlobal*` flags.
- `components/editor/ActionEditor.jsx` — the quick-action strip, the "Add action" fly-out in the
  documented order, the `< n-m >` pager, per-action delete, and a parameter editor for every
  action type.
- `lib/actions.js` — action defaults, menu ordering, file-name templates, and the camera state
  machine behind the availability rules.
- `store.js` — `recordCurrentAttitude`, plus a shared `attitudeActions()` builder that
  `addWaypoint` now uses instead of its own inline copy.
- `pages/Editor.jsx` — right-hand inspector with Route settings / Waypoint tabs; selecting a
  waypoint switches to it.

### Key decisions
- **Aircraft-aware panels.** Camera chips come from the aircraft catalogue in `/api/meta`, so the
  M30T shows WIDE/ZOOM/IR and Smart Low-Light while other models show their own sensors. Nothing
  is hard-coded in the frontend.
- **Blocked actions explain themselves.** The reference silently refuses to attach a blocked
  action; we disable the menu entry and show the reason. Same behaviour, less confusing.
- **Point of Interest is per-waypoint only.** It is a waypoint heading mode, so it is filtered out
  of the route-level Aircraft Yaw list.
- `startDistanceShoot` is offered but disabled on M30 waypoint routes, matching the observation in
  §6 that it would not attach there, with the reason shown in the menu.

### Deviations from plan
- The plan specified **React Hook Form + Zod** for these panels. The inspector controls are live —
  every change writes straight to the store so the map and stats update as you drag a slider —
  which is not the submit-and-validate lifecycle RHF is built around. They are controlled inputs
  with clamping at the control, and the server still validates every field with Zod on save. RHF
  remains used where there is a real submit step (the save dialog, and the Phase 6 Create Route
  dialog).
- Gimbal tilt uses a −90°/+30° range. The reference recorded the default (0°) but not the travel
  limits; this is the conventional gimbal pitch range and is flagged in a code comment.

### Bugs found and fixed
- The blocked-reason text for Take Photo said "Add End Recording first" while the action is
  labelled "Stop Recording" — the instruction pointed at a menu entry that does not exist.

### Verified
Driven end-to-end in the browser against the live backend:
- **Take Photo blocked while recording** (§6 rule 1): with recording active, Take Photo and Start
  Recording are disabled and Stop Recording is enabled; after Stop Recording, Take Photo is
  available again. The state machine walks the whole route, not just one waypoint.
- **Interval rules**: End Interval Shot is disabled until an interval is running, and Start Timed
  Interval Shot is disabled while one already is.
- **Follow Route** (§6 rule 2): on, the lens chips are disabled and the panel says the lenses are
  inherited; off, they become selectable.
- **Photos stat** (§6 rule 3) recomputed live: 0 → 59 with a 3 s timed interval, back to 0 once
  End Interval Shot was added.
- Override toggles enable their fields; global speed 10 → 15 dropped the duration 3 m 16 s →
  2 m 31 s; a uniform global altitude change correctly left 3-D distance unchanged.
- Save round-trip: settings, `use_global_*` flags, action order and action params (including
  `followRoute` and `interval`) all persisted and reloaded intact.
- A locked wayline disables every panel input and the Save button, and shows the locked banner.
- Production build succeeds (155 modules); console clean.

### Next
**Phase 5** — Area and Linear routes: polygon and centre-line drawing on the map, their settings
panels from §8, and boustrophedon generation in `lib/routegen.js`.

---

## Phase 5 — Area and Linear mapping routes ✅

**Date:** 2026-09-02 · **Version:** 0.6.0

### What was built
- `lib/routegen.js` — the boustrophedon generators. A camera footprint model turns GSD and the two
  overlap rates into line spacing and photo spacing; polygons are rotated to the course angle,
  scanned, and each scan line's boundary crossings are paired into inside-segments before being
  rotated back. Linear routes buffer the centre line by the left/right extensions into a corridor,
  cut it into `cuttingDistance` sections, and fill each one parallel to the line.
- `components/editor/MappingSettingsPanel.jsx` — every control from §8.1 and §8.2, with the
  derived frame width, line spacing and photo spacing shown so the settings are inspectable
  rather than opaque.
- `MapCanvas.jsx` — drawing mode: click to place vertices, double-click or Finish to close,
  Esc or Cancel to abandon. The committed shape gets draggable vertex handles, and the generated
  boustrophedon is drawn in green inside the blue boundary.
- `Editor.jsx` — route-type switcher (empty missions only), `?type=`/`?series=`/`?model=` query
  parameters so Phase 6's Create Route dialog can hand off cleanly, and debounced regeneration on
  every geometry or settings change.
- `StatsBar.jsx` — Area for area routes, Centre Line plus Area for linear ones, wrapping into a
  grid once there are more than four metrics.
- `backend/constants.js` — `MAPPING_SENSORS`, and the §8 route-type defaults (an area route
  starts in AGL at 15 m/s, a linear route at 10 m/s).
- `frontend/test/routegen.test.mjs` — 16 tests, run with `npm test` in `frontend/`.

### Key decisions
- **The sensor catalogue is a stated assumption, not observed data.** §8 records the GSD and
  overlap defaults but not the sensor specifications behind them, and GSD is meaningless without
  them. `MAPPING_SENSORS` therefore holds published still-image resolutions, flagged as an
  assumption in the source. Our estimates respond correctly to every setting but do not reproduce
  the reference's exact figures: for the §8.1 rectangle it reports 522.9 m where we compute
  670 m over three lines. This is recorded rather than papered over.
- **Regeneration does not push undo history**, and is skipped entirely when the result matches
  what is already loaded. For these routes the undoable state is the geometry and the settings.
- **The §1 compatibility matrix is enforced in the editor.** Choosing a route type the current
  aircraft cannot fly switches to the first compatible series — an M30T cannot fly a linear
  route, so picking Linear moves to the Mavic 3E.

### Bugs found and fixed
- **A saved mapping route opened dirty.** Regeneration ran on load and always wrote to the store,
  so merely opening a route marked it as having unsaved changes and armed the navigation guard.
  `applyGeneratedRoute` now compares the generated path against the loaded one and does nothing
  when they match.
- **setState inside a state updater, again.** `handleFinishDrawing` committed the geometry from
  inside a `setDraft` updater, which React reported as updating a component while rendering.
  Same class of bug as the Phase 3 reorder; it now reads `draft` directly. All other updaters in
  the codebase were checked and are pure.
- **A stale closure in `startRoute`** captured `mission` from the first render, so the aircraft
  compatibility check read outdated values. It now reads live store state.
- The stats bar squashed five metrics into one row; it now wraps into a grid.

### Verified
`npm test` passes 16/16, and end-to-end in the browser against the live backend:
- Area: drew a polygon, generated a serpentine inside it; Finish stays disabled below three
  points; double-click finishes; Esc cancels a redraw and leaves the previous route intact.
- Settings drive regeneration live: side overlap 70 % → 90 % tightened line spacing 60 m → 20 m
  and took the route from 6.59 km/206 photos to 18.14 km/572 photos.
- Area defaults match §8.1 exactly: AGL, 15 m/s, GSD 5 cm/px, safe takeoff 20 m, Ortho, and
  WIDE/IR only on the M30T — no Zoom.
- Linear: drew a three-point centre line, generated a corridor fill; the header shows Centre Line
  and Area; defaults match §8.2 (10 m/s, 50 m extensions, 1000 m cutting, Parallel to Center Line).
- Both types save and reload byte-identically, geometry included, and reload no longer marks the
  mission dirty.
- Production build succeeds; console clean.

### Next
**Phase 6** — the wayline library: grid with SVG preview thumbnails, search, model and route-type
filters, sort, folders, per-card Rename / Duplicate / Delete / Lock, and the Create Route dialog
enforcing the §1 compatibility matrix.

---

## Phase 6 — Wayline library ✅

**Date:** 2026-09-02 · **Version:** 0.7.0

### What was built
- `pages/Library.jsx` — the three-column layout from §2: folder tree, route list, and a map
  preview of the selected route with the four metrics beneath it.
- `components/library/RoutePreview.jsx` — SVG thumbnails generated from the waypoint path the
  list endpoint already returns, with Point S marked. Nothing is stored, so a thumbnail can never
  go stale against its route.
- `components/library/RouteCard.jsx` — name, aircraft model with a drone glyph, route-type icon,
  waypoint count, `Updated at YYYY-MM-DD HH:MM:SS`, inline rename pencil, and the overflow menu
  (Rename · Move · Duplicate · Download · Lock · Delete).
- `components/library/CreateRouteDialog.jsx` — all seven route types in their three groups with
  the four out-of-scope ones marked unsupported, aircraft and model pickers that enforce the §1
  compatibility matrix, the Matrice 400 payload picker, and the auto-incrementing
  `New <Type> Route(n)` name.
- `components/library/FolderTree.jsx` — hierarchical folders; the new-folder button creates a
  subfolder, Shift+click creates a sibling.
- `MapCanvas.jsx` gained a `readOnly` mode so the library reuses the editor's map without
  offering editing.
- Backend: `GET /api/waylines` now accepts `folder_id` (with `root` for unfiled routes).

### Key decisions
- **Search and filtering run client-side.** The backend supports the same filters, but the list is
  small and already in memory, so typing stays instant with no request per keystroke. Server-side
  filtering stays available for when the library grows.
- **Every mutation refetches the list** rather than patching local state, so the UI cannot drift
  from the server.
- **Download .kmz is present but disabled**, labelled as arriving in Phase 8, rather than hidden —
  the menu matches the reference's shape and says what is coming.
- Selecting a card previews it; double-click, or the Open in editor button, opens it.

### Verified
End-to-end in the browser against the live backend:
- Thumbnails render distinctly per route type — the linear corridor's zigzag, the area route's
  parallel lines, and the waypoint perimeter are all recognisable.
- Preview matches the editor exactly for the same route (35.82 ha, 18.14 km, 21 m 33 s, 52
  waypoints), with all 52 markers drawn.
- Route-type filter, aircraft filter, search and the New-Old / Old-New sort all narrow and reorder
  correctly, with a distinct empty state for "no matches" versus "no routes yet".
- Rename (inline), Duplicate, Lock, Unlock, Move and Delete all work; a locked route disables
  Rename, Move and Delete while leaving Unlock available.
- Cancelling a delete leaves the list untouched; the folder-delete confirmation uses the exact
  warning text captured in §2.
- Folders: plain click creates a subfolder of the selection, Shift+click creates a sibling —
  confirmed against the stored `parent_id` values. Counts and folder filtering update correctly.
- Create Route enforces the §1 matrix on every row: Waypoint allows all six series, Linear blocks
  the M30 series, Smart 3D Capture and Patrol allow only M4E/M4D/M400. Unsupported types disable
  OK and explain why. The M400 payload picker lists all four groups.
- The dialog hands off to the editor with the route type, aircraft, model and pre-filled name; a
  Mavic 3T area route correctly offers VISIBLE/IR lenses rather than the M30T's WIDE/ZOOM/IR.
- `npm test` passes 16/16; production build succeeds; console clean.

### Next
**Phase 8** — KMZ import and export (`backend/wpml.js`) against the real fixture, wiring up the
card's Download action, then final polish and the README. **Phase 7** (fleet and assignment)
comes first.

---

## Phase 7 — Drone fleet and assignment ✅

**Date:** 2026-09-02 · **Version:** 0.8.0

### What was built
- `pages/Drones.jsx` — the fleet grid and the assignment table on one page, with status-filter
  chips carrying live counts.
- `components/fleet/DroneCard.jsx` — per-aircraft card with inline rename, a status selector
  (idle / flying / offline) and the number of assignments it holds.
- `components/fleet/AssignDialog.jsx` — pick a route, tick one or more aircraft, create one
  assignment per aircraft.
- `components/fleet/AssignmentTable.jsx` — route → aircraft → status → assigned-at, with manual
  advance, mark-failed, reset and remove.

No backend work was needed; the drones and assignments endpoints from Phase 1 already covered it.

### Key decisions
- **This whole feature is our own design, and the code says so.** Feature-reference §10 records
  that FlightHub's fleet and task modules were never explored, so inventing a lookalike would
  break the project's "don't guess" rule. It follows the brief's fallback spec instead, and the
  file headers state that plainly.
- **Mismatches are surfaced, not blocked.** A route authored for an M30T will not fly correctly on
  a Mavic 3T, and an offline aircraft cannot receive one — so the dialog flags both with a badge
  and a warning, but still lets the user proceed. This is a mock fleet; a hard block would be
  asserting a rule the exploration never established.
- **Every mutation refetches**, as in the library, so the table cannot drift from the server.
- `failed` is reachable from any unfinished state; `complete` and `failed` both offer a reset
  rather than being dead ends.

### Verified
End-to-end in the browser against the live backend:
- The four seeded aircraft render with the right series labels and statuses.
- Assign dialog: the mismatch badges track the selected route — with the M30T area route chosen,
  only the M3T and M3TD aircraft are flagged, and Falcon 01/02 are not. Selecting an offline
  aircraft adds a second, separate warning. Submit stays disabled until a route and at least one
  aircraft are chosen.
- Assigning to three aircraft created exactly three rows, and the per-card assignment counts
  updated.
- The full lifecycle works: Pending → Synced → In progress → Complete, with no advance control
  past Complete; mark-failed works from an unfinished row; reset returns either terminal state to
  Pending; the filter counts follow every change.
- Fleet edits: rename and status changes persist; adding an aircraft takes its model and series
  from the `/api/meta` catalogue rather than free text.
- Removing an assignment prompts by name and removes only that row.
- **Deleting a wayline that has assignments cascades correctly** — checked directly against the
  API: two assignments created, the wayline deleted (204), both assignment rows gone with no
  foreign-key error and no orphans.
- `npm test` passes 16/16; production build succeeds; console clean.

### Next
**Phase 8** — KMZ import and export: `backend/wpml.js` building and parsing real WPML 1.0.6, the
round-trip test against the captured fixture, wiring the library card's Download action, then
final polish and the README.
