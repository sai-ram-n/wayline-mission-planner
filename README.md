# Wayline Mission Planner

A local, full-stack drone flight-mission planner. Plan a mission on an interactive map, configure
each waypoint and the actions it performs, save it as a named wayline, browse and edit saved
waylines in a library, assign one to your drones, and export it as a flight-ready `.kmz`.

Built entirely on free and open-source tooling — no paid APIs, no API keys, no accounts.

> **Status:** feature-complete across all eight planned phases, on the `dev` branch.
> See [`docs/progress-log.md`](docs/progress-log.md) for the per-phase record.

---

## Documentation

| Document | Purpose |
|---|---|
| [`docs/feature-reference.md`](docs/feature-reference.md) | **The specification.** Feature-by-feature reference compiled from hands-on exploration of a production wayline editor, including the complete WPML/KMZ data model. Everything in this app is built against it. |
| [`docs/progress-log.md`](docs/progress-log.md) | Running project memory: phase status, decisions, deviations, risks. |

## Tech stack

**Frontend** — React · Vite · Tailwind CSS · React Router · Leaflet + react-leaflet · Turf.js ·
Zustand · React Hook Form + Zod · Axios · react-icons

**Backend** — Node.js · Express · better-sqlite3 · Zod · JSZip · fast-xml-parser

**Database** — SQLite (single file, zero configuration)

## What it does

**Mission editor** — click the map to place waypoints, drag to reposition, reorder by pointer or
`Alt`+arrow keys. Per-waypoint altitude, speed, heading (including point-of-interest) and turn
behaviour, each able to inherit from the route or override it. A full waypoint-action editor
covering photo, video, interval capture, hover, aircraft yaw, gimbal yaw and tilt, zoom, panorama
and folder creation, with live flight distance, duration and photo-count estimates.

**Mapping routes** — draw an area polygon or a corridor centre line and get a boustrophedon survey
route generated from GSD, side and forward overlap, course angle, margin and corridor extensions.
It regenerates as you change any setting.

**Library** — saved routes with generated SVG preview thumbnails, hierarchical folders, search,
aircraft and route-type filters, sorting, and per-route rename, move, duplicate, lock, download
and delete.

**Fleet** — a mock fleet with per-aircraft status, and assignments that advance through
`pending → synced → in_progress → complete`, with `failed` reachable from any unfinished state.

**KMZ interchange** — export any route as a real DJI-compatible WPML 1.0.6 `.kmz`, and import one
back. See [Known limitations](#known-limitations).

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Getting started

Run the backend and the frontend in two terminals.

```bash
cd backend && npm install && npm run dev
```

```bash
cd frontend && npm install && npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3001/api |

The SQLite database is created automatically on first run and seeded with a small mock fleet.

## Tests

```bash
cd backend && npm test
```

```bash
cd frontend && npm test
```

The backend suite covers WPML build and parse, including a round-trip against a genuine wayline
export captured from a live editor. The frontend suite covers the route-generation geometry.

## Known limitations

These are deliberate and documented rather than undiscovered.

- **Survey estimates are our own.** Turning a GSD into a flight-line spacing needs the camera's
  sensor resolution, which the source exploration recorded no value for. `MAPPING_SENSORS` in
  `backend/constants.js` therefore holds published still-image resolutions as a stated assumption.
  Generated distances and photo counts respond correctly to every setting and are internally
  consistent, but they do not reproduce the reference editor's exact figures.
- **Take Photo and Take Photo (Fixed Angle) collapse on KMZ import.** Both map to the same WPML
  actuator (`takePhoto`), and the captured schema records no distinct actuator for the fixed-angle
  variant, so an imported file cannot tell them apart. Smuggling the difference through a
  non-standard element would corrupt the file for a real aircraft. Covered by an explicit test.
- **Four route types are out of scope.** Patrol, Slope, Geometric and Smart 3D Capture appear in
  the Create Route dialog marked unsupported. Patrol is fully documented in the feature reference;
  the other three were never explored.
- **Merge is not implemented** — neither Merge Mapping Area nor the library's Merge action. The
  source exploration never opened either dialog, so their behaviour is unknown and building them
  would mean inventing it.
- **The fleet and assignment model is our own design.** The source application's fleet and task
  modules were never explored, so this follows the project brief's simpler specification rather
  than guessing at them.
- **3D is a tilted flat plane, not terrain.** The 2D/3D toggle tilts the map so waypoint altitude
  becomes visible, and heights are exaggerated by a displayed factor to stay readable. There is no
  elevation data, so the ground is flat and the view is read-only — editing stays in 2D.
- **Terrain following is nominal.** `AGL` is stored and exported, but there is no elevation service,
  so altitudes are not resolved against real terrain.

## Versioning

`version.js` at the repository root is the single source of truth for the application version and
build date, and is bumped on every commit:

```bash
node scripts/bump-version.mjs patch
```

Accepts `major`, `minor`, `patch`, or an explicit `x.y.z`.

## Map tiles and attribution

Map tiles come from **OpenStreetMap** and require no API key. Usage here is light development
traffic, which the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
permits, and attribution is displayed on the map as that policy requires.

For anything heavier than local development — a deployment, a demo with real traffic, or automated
requests — do not point at the public OSM tile servers. Self-host your own tiles, or use a free
tier from a provider such as MapTiler or Stadia Maps.

## Licence and scope

This project is an independent implementation. It reproduces *functionality and interaction
patterns* only. It contains no third-party branding, logos, artwork or code, and no affiliation
with or endorsement by any drone manufacturer is claimed or implied. Aircraft model names appear
solely to identify which hardware a mission targets.
