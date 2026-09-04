# DJI Matrice 4D Final Gap Analysis

Re-audit of the current codebase (5 phases implemented and committed since
`docs/DJI_MATRICE_4D_FEATURE_GAPS.md`) against the attached DJI FlightHub
Matrice 4D checklist. Read-only audit — no code changed, no commits made.

All 5 prior phases were re-verified end-to-end in the current tree (grep +
targeted reads of the actual call sites, plus the existing 86-test suite,
which still passes 86/86 unchanged): the `M4D` model entry in
`backend/constants.js` now carries `excludedActions`, `smartLowLight`,
`defaultZoomRatio`, `bypassObstacle` and is read by `actions.js`/`store.js`/
`GlobalSettingsPanel.jsx`; `ActionEditor.jsx` has a real `confirmingDelete`
two-click state machine; `accessories` flows Create Route dialog → query
string → `Editor.jsx` → `mission.settings.accessories` → `saveMission`;
`MapCanvas.jsx` mounts `CompassWidget`, the coordinate/datum readout, and
react-leaflet's `ScaleControl`; `Library.jsx`/`RouteCard.jsx` have a working
`checkedIds` selection driving bulk download/delete. None of the five are
dead code or UI-only stubs.

## 1. Verification Summary
- Total DJI checklist items reviewed: ~147 (same §1–§20 scope as the prior audit)
- Fully implemented: ~136
- Partially implemented: 0
- Missing: 6
- Not applicable: 5 (DJI-confirmed absent on M4D itself: exposure/ISO/shutter/focus/white-balance, thermal camera controls, battery/range estimate)
- Cannot verify: 6 (DJI's own source document marks these "C — could not verify" in the live UI; see §4)

## 2. Fully Implemented

Resolved by the 5 phases just implemented (all confirmed live in code, not just referenced):
- Matrice 4D model config parity with 4TD (Gimbal Yaw exclusion, Smart Low-Light, Bypass Obstacle, 7X zoom default) — `backend/constants.js`
- Two-click action-delete confirmation — `ActionEditor.jsx`
- Accessories selector (AS1 Speaker / AL1 SpotLight) — `CreateRouteDialog.jsx` → `settings.accessories`
- Compass widget + persistent altitude/datum readout + scale bar — `MapCanvas.jsx`
- Bulk select/download/delete in the library — `Library.jsx` / `RouteCard.jsx`

Everything else already confirmed in the prior audit and unchanged since: full waypoint/action CRUD, all verified action parameter editors, aircraft/route-type compatibility matrix, global + per-waypoint settings (altitude modes, heading modes incl. POI, turn modes, per-waypoint overrides), library CRUD (rename/move/duplicate/lock/delete/download/import), KMZ round-trip, live stats, undo/redo, keyboard shortcuts, 2D/3D tilted view, camera-coverage and gimbal-orientation overlays, and server-side parameter-range validation (Zod). See the prior gap document for the full per-section trace; not repeated here.

## 3. Partial / Missing Features

### Smart Capture / Intelligent Detection (BETA)
- Status: Missing
- DJI reference behavior: §8/§9 of the attached document — a sixth quick-action strip entry, "Smart Capture (BETA)," expanding into a paired **Start/End Intelligent Detection** action, confirmed present (status A) on the actual Matrice 4D test route. `docs/feature-reference.md` §8.3 (same source-of-truth project, a different session, Patrol Route) documents likely parameter shapes in detail: Smart Detection Type, per-subject Warning Threshold (People/Vehicles/Boats, comparator + count), Confidence Level slider, Alert Interval stepper, Camera for Recognition, Photo Storage Settings.
- Current application behavior: No `smartCapture`/`intelligentDetection` identifiers anywhere in `backend/constants.js` or `frontend/src/lib/actions.js` (re-confirmed by grep).
- What is missing: The action pair itself, its parameter editor, paired-state availability rules (mirroring `cameraStateAt`'s recording/interval-shot state machine), and a WPML export decision.
- Relevant code: `backend/constants.js` (`ACTION_TYPES`/`ACTION_LABELS`/`ACTION_ACTUATOR`), `frontend/src/lib/actions.js` (`ACTION_MENU`, `defaultParams`, `actionAvailability`), `frontend/src/components/editor/ActionEditor.jsx` (`ActionParams` switch), `backend/wpml.js` (export).
- Recommended implementation: Build the UI/state using the parameter shape already documented in `feature-reference.md` §8.3 (it is this app's own established source of truth), but do **not** invent a WPML `actionActuatorFunc` for it — no verified mapping exists for this BETA feature on any route type. Persist it in `settings`/action `params` like every other action, and exclude it from `buildKmz`'s actuator mapping (or export it under a clearly-labeled placeholder actuator) until a real DJI export sample is available. This is buildable now; only the export half needs an explicit "not verified" caveat, not the whole feature.
- Priority: Medium

### Merge routes
- Status: Missing
- DJI reference behavior: §2/§17 — a "Merge" entry in the route card's `…` overflow menu, enabled when multiple routes are selected. Status **A (present)** in the source document — the button and its gating (multi-select required) are confirmed; only the resulting dialog/algorithm was never exercised.
- Current application behavior: `RouteCard.jsx`'s `OverflowMenu` has Rename/Move/Duplicate/Download/Lock/Delete but no Merge. `Library.jsx` now has bulk-select (`checkedIds`, added this session) that could gate it exactly the way DJI's own UI gates Merge on a multi-selection.
- What is missing: A merge operation and its endpoint.
- Relevant code: `RouteCard.jsx` `OverflowMenu` items list; `Library.jsx` (already has `checkedIds`, `checkedWaylines` from Phase 5 — natural home for a "Merge selected" bulk action alongside Download/Delete); `backend/repository.js` (needs a new `mergeWaylines` primitive alongside `duplicateWayline`); `backend/routes/waylines.js`.
- Recommended implementation: Since DJI's own combining algorithm was never observed, do not guess at DJI parity. Implement it as this app's own defined behavior (the same stance `feature-reference.md` §11.7 already takes for the drone-fleet/assignment feature): concatenate the selected waylines' waypoints in list order into a new wayline, keep the first selected route's settings/aircraft, and require all selected routes share a compatible `route_type`. Surface it as "Merge selected" in the new bulk-action bar from Phase 5.
- Priority: Medium — now cheaper to build than originally scoped, since Phase 5 already added the multi-select plumbing it needs.

### Map search tool
- Status: Missing
- DJI reference behavior: §3 — a magnifying-glass search box (scope dropdown: Global/Location/Annotation/Device/Model/Photo).
- Current application behavior: `MapCanvas.jsx`'s control cluster has 2D/3D, zoom ±, fit-to-route, basemap switcher, and (as of Phase 4) the compass and readout — no search input.
- What is missing: A location search box.
- Relevant code: `MapCanvas.jsx:867-940` (control cluster).
- Recommended implementation: A place-name search box calling a public Nominatim (OpenStreetMap) geocoding endpoint — no new paid dependency, and consistent with the OSM tile attribution already displayed. On a result, `map.flyTo()`/`fitBounds()`. Device/annotation/photo search scopes from DJI's version don't map to anything this app models (no device fleet map, no annotation layer yet — see below) and should be left out rather than faked.
- Priority: Low-Medium — genuinely useful for "find where I need to fly," not merely cosmetic, but not blocking route authoring since users can already pan/zoom/click.

### Map annotation, measurement, and rectangle/circle draw tools
- Status: Missing
- DJI reference behavior: §3 — point/line/rectangle/circle annotation tools with their own color palette, independent of mapping-route area/linear drawing. Rectangle and circle tool icons are confirmed **present** in the DJI UI (status A) even though their click-through behavior was deliberately not exercised by the source auditor.
- Current application behavior: The only drawing mechanism in `MapCanvas.jsx` is `drawMode='area'|'linear'`, which is route-geometry authoring (produces a boustrophedon mission), not general-purpose map markup.
- What is missing: A separate, persisted annotation layer (point/line/rectangle/circle) unrelated to route geometry.
- Relevant code: `MapCanvas.jsx:429-443` (`handleMapClick`, branches on `placementMode`/`drawMode` — a third mode must not break this), `backend/schemas.js`/`repository.js` (new `annotations` table needed if annotations should persist across reloads), `backend/db.js`.
- Recommended implementation: A new `annotations` table (id, wayline_id or global, kind: point/line/rectangle/circle, geometry, color), a small CRUD route, and a fourth `MapCanvas` interaction mode reusing the existing draw-mode click-handling pattern. This is genuinely useful for marking hazards/reference points during mission planning, not merely decorative.
- Priority: Low-Medium

### GEO Zone / Task Area map overlays
- Status: Missing
- DJI reference behavior: §3/§13 — yellow/green shaded "GEO ZONE" and "TASK AREA" polygons rendered on the map by default, and implicitly the substrate for any pre-flight geofence-conflict warning.
- Current application behavior: No geofence/zone concept anywhere in `backend/schemas.js`, `db.js`, or `repository.js`. `MapCanvas.jsx` has no overlay for it.
- What is missing: A geofence/zone data source and a read-only overlay layer, plus (longer-term) a save-time or dispatch-time conflict check against it.
- Relevant code: `backend/db.js` (new `geo_zones` table), `backend/schemas.js`/`repository.js`/a new route file, `MapCanvas.jsx` (Polygon overlay, reusing the existing `<Polygon>` pattern already used for mapping-route geometry).
- Recommended implementation: This is buildable, not architecturally blocked — it only requires deciding what "zone" data means for a single-tenant app with no org/project layer (DJI's zones are org-provisioned; here they'd need to be user-authored or seeded). Model as simple named polygons with a type (`geo_zone`|`task_area`), CRUD them the same way folders are CRUD'd today, render read-only on the map. A save-time warning ("this route crosses a GEO Zone") is a reasonable, low-risk follow-on once the data exists.
- Priority: Low — safety-relevant in DJI's product, but this app has no org/fleet-wide provisioning story to hang real zone data off of, so a first cut would be user-authored placeholder data rather than an operationally meaningful safety feature.

### Virtual-flight / FPV authoring, live camera preview, Snapshot Preview & AI Spot-Check
- Status: Partially implemented (data model only — no FPV chrome)
- DJI reference behavior: §0/§4 — waypoints are authored by "flying" a virtual aircraft with a live FPV camera cone, picture-in-picture preview, and per-photo-action rendered "Snapshot Preview" + AI Spot-Check.
- Current application behavior: Re-verified this pass rather than re-asserting the prior "deliberate scope difference" framing. `Map3DOverlay.jsx` + `MapCanvas.jsx`'s 3D mode render a tilted, view-only projection of the flat map (CSS 3D transform over Leaflet tiles) — there is no elevation/terrain data, no first-person camera, no WASD virtual-aircraft movement, and the 3D mode is explicitly non-interactive ("3D is view only — switch to 2D to edit," `MapCanvas.jsx`). The full waypoint/action/attitude data model that FPV authoring would produce is fully present and editable via the click-to-place equivalent (`docs/feature-reference.md` §4/§12 already documents this substitution).
- What is missing: An actual first-person virtual-flight authoring mode with a real 3D scene/terrain and a rendered camera preview.
- Relevant code: `MapCanvas.jsx`, `Map3DOverlay.jsx`, `frontend/src/lib/projection3d.js`.
- Recommended implementation: This is a genuine **ARCHITECTURAL CHANGE**, not a convenience trade-off being waved away — it requires a 3D terrain/elevation service and a real-time 3D rendering pipeline (e.g., CesiumJS with a terrain provider) that this app has no dependency on today, plus a live-render camera preview per waypoint. It is buildable in principle; it is not a small phase. Given the size, it should be scoped as its own project decision (pick and integrate a terrain service) before any implementation phase is planned, not folded into this backlog's phase sequence.
- Priority: Low — large, infrastructure-gated, and the underlying data model already has full parity via the existing click-to-place authoring, so the mission-planning *outcome* (a correct, exportable wayline) is not blocked by its absence.

## 4. Previously Skipped Features

Explicit re-determination for every item the prior pass excluded or deprioritized, per the instruction not to silently drop anything:

1. **Smart Capture / Intelligent Detection** — Previously deferred as "low-confidence to build correctly." **Re-determined: genuinely needs implementation** (see §3 above). DJI's own document confirms the action exists (status A) on the actual M4D test route; this codebase's own `feature-reference.md` already documents a plausible parameter shape from the same source project. Only the WPML export mapping is unverified, not the feature's existence or buildability — that's a valid scope for one phase of the export half, not a reason to exclude the whole feature.
2. **Merge routes** — Previously "deliberate scope difference, pending new source material." **Re-determined: needs implementation.** DJI's document confirms the menu entry and its multi-select gating are real (status A); only the exact combining algorithm is unverified. That's not a blocker — this app already defines its own semantics for other DJI-adjacent features (the assignment/fleet feature per `feature-reference.md` §11.7) without claiming DJI parity. Phase 5's bulk-select work also makes this materially cheaper to build now than when originally scoped.
3. **Virtual Flight / FPV authoring** — Previously "documented deliberate architectural decision." **Re-determined: correctly stays a large, gated item, but is now marked Partially Implemented rather than dismissed**, because the underlying data model is complete via click-to-place authoring. It is not being excluded from this document — see §3 — but implementing the FPV chrome itself is genuinely blocked on a 3D terrain/scene service decision this project has not made, which is a legitimate (not merely convenient) reason to sequence it outside the normal phase backlog.
4. **GEO Zone overlays** — Previously "requires an org/project data model this app doesn't have; undefined scope." **Re-determined: buildable, needs implementation**, just smaller in ambition than DJI's org-provisioned version (see §3's recommended approach: user-authored zone polygons, not org-fleet-wide data). Moved from "out of scope" to a real (low-priority) phase.
5. **Map search tool** — Previously "lower value for a single-drone mission planner." **Re-determined: needs implementation.** Finding a location to fly is core route-planning functionality, not a nice-to-have; it was under-weighted before. A Nominatim-based search box requires no new dependency. Moved to a real phase.
6. **Map annotation/measurement/rectangle/circle tools** — Previously "lower value... defer unless explicitly requested." **Re-determined: needs implementation**, though scoped smaller than the full DJI toolset (device/photo annotation types don't apply here). Marking hazards or reference points is genuinely relevant to mission planning. Moved to a real phase.
7. **Other items excluded via "DJI could not verify" (C-status) in the source document** — the prior audit dropped these from the gap list entirely on the grounds that DJI's own auditor never confirmed the reference behavior. Re-examined individually rather than bulk-excluded:
   - *Action reorder within a waypoint* and *action duplicate/copy to another waypoint* — DJI status C (auditor never located a reorder/copy control). This app also lacks both (confirmed: no `reorderAction`/`duplicateAction` in `store.js`). **Status: CANNOT VERIFY.** Building a reorder/duplicate UI is technically easy, but there is no confirmed DJI reference behavior to build *toward* — doing so anyway would be adding an original feature under the banner of "DJI parity," which the instructions ask not to guess at. Not recommended as a DJI-gap item; could be proposed separately as an original UX improvement if the user wants it, but that's a different kind of request.
   - *Multi-select waypoints (for editing, distinct from the library's route multi-select)* — DJI status C. This app has no waypoint multi-select either. **Status: CANNOT VERIFY.** Same reasoning as above.
   - *Per-leg distance/time breakdown* — DJI status C. This app's `computeStats` (`frontend/src/lib/geo.js`) computes only route-total distance/duration, not per-leg. **Status: CANNOT VERIFY** as a DJI-parity item; note that computing it ourselves would be straightforward if wanted as an original feature, since the per-leg distance is already an intermediate value inside `computeStats`'s loop.
   - *Explicit action execution-timing selector (before/at/after waypoint)* — DJI status C; the source document explicitly says the UI never surfaced a timing control to confirm against. **Status: CANNOT VERIFY.** This app fires actions "at waypoint" implicitly (WPML `actionTrigger.actionTriggerType = reachPoint`, per `feature-reference.md` §7) with no user-facing selector — consistent with DJI's own unconfirmed state, not a gap.
   - *Dedicated "Validate Route" button* — DJI status C. This app validates synchronously via the Zod schemas on every save (`backend/schemas.js`) rather than via an explicit user-triggered validate action. **Status: CANNOT VERIFY** whether DJI has a distinct button; this app's continuous validation is a reasonable design choice already in place, not a confirmed gap.
   - *Corner-radius numeric field* — DJI status C (no such field found; only the qualitative Waypoint Type presets). This app's `turn_damping_dist` (`WaypointPanel.jsx`, "Turn Damping Distance") is functionally the same concept and is already implemented and wired to the pass-through turn modes. **Status: Implemented** (not cannot-verify) — the app already has an equivalent control; it does not need to match an unconfirmed DJI field.
   - *Undo/redo, import route file* — DJI status C for both, but **this app already implements both** (`store.js`'s `undo()`/`history`, `POST /waylines/import` in `backend/routes/waylines.js`). **Status: Implemented.** Re-flagging here only because the prior pass's blanket "exclude all C-items" rule would have silently under-reported these as absent; they are not.

## 5. Final Implementation Plan

Phases for the 5 genuinely-remaining, buildable gaps (excludes the CANNOT VERIFY items in §4.7, and sequences the architecturally-gated FPV item separately). Ordered by dependency and by how much each phase's plumbing is reused by a later one.

**Phase 6 — Smart Capture / Intelligent Detection (UI + state only, export explicitly unmapped)**
Add `startIntelligentDetection`/`stopIntelligentDetection` to `ACTION_TYPES`/`ACTION_LABELS` (backend) and `ACTION_MENU`/`defaultParams`/`actionAvailability` (frontend), reusing `cameraStateAt`'s paired-state pattern. Parameter editor per `feature-reference.md` §8.3. Explicitly do not add a WPML actuator mapping in `wpml.js` — document the export gap inline. Independently testable (unit tests on `actionAvailability`/`defaultParams`, mirroring `frontend/test/actions.test.mjs`) and committable without touching any other phase.

**Phase 7 — Merge routes**
Add `mergeWaylines` to `backend/repository.js` + a route in `backend/routes/waylines.js`, and a "Merge selected" button in the bulk-action bar `Library.jsx` already has from Phase 5 (reuses `checkedWaylines`). Gate on matching `route_type` across the selection. Independently testable via a repository-level test plus a live curl round-trip (as done for Phases 3 and 5 in the prior session).

**Phase 8 — Map search**
Add a Nominatim-backed search input to `MapCanvas.jsx`'s control cluster; on selection, `flyTo`/`fitBounds`. No backend change. No new dependency (plain `fetch`). Independently testable by mocking the geocoding response in a frontend unit test around the query-building/result-parsing logic (kept separate from the fetch call itself).

**Phase 9 — Map annotation/measurement/rectangle/circle tools**
New `annotations` table + CRUD route (mirrors the existing `folders` route's shape) and a fourth `MapCanvas` interaction mode. Depends on nothing above; could be reordered earlier if prioritized higher. Independently testable via schema/repository tests plus a live create/list/delete round-trip.

**Phase 10 — GEO Zone overlays**
New `geo_zones` table + CRUD route + read-only `MapCanvas` overlay (reuses the `<Polygon>` pattern from Phase 9's annotations and from the existing mapping-route geometry rendering). Sequenced after Phase 9 since it can share the same new-table/CRUD-route scaffolding pattern once that exists.

**Phase 11 (separate track, not sequenced with the above) — Virtual-flight / FPV authoring**
Gated on a project-level decision to adopt a 3D terrain/scene service (e.g., CesiumJS + a terrain provider). Not phased in detail here — the first real phase of this track would be "select and integrate a terrain service," which is a technology decision outside this backlog's scope, not an implementation task with a known shape yet.
