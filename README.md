# Wayline Mission Planner

A local, full-stack drone flight-mission planner. Plan a mission on an interactive map, configure
each waypoint and the actions it performs, save it as a named wayline, browse and edit saved
waylines in a library, assign one to your drones, and export it as a flight-ready `.kmz`.

Built entirely on free and open-source tooling — no paid APIs, no API keys, no accounts.

> **Status:** in development, built phase by phase on the `dev` branch.
> See [`docs/progress-log.md`](docs/progress-log.md) for what's done and what's next.

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
