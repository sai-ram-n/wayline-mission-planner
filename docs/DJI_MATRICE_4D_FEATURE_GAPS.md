# DJI Matrice 4D Feature Gaps

Audited against the attached "DJI FlightHub — Matrice 4D Route Feature Audit & Checklist"
(live UI exploration, 2026-09-04). Every row marked **A. Confirmed in UI** in that document was
traced through this codebase: `backend/constants.js`, `backend/schemas.js`, `backend/wpml.js`,
`backend/routes/waylines.js`, `frontend/src/store.js`, `frontend/src/lib/actions.js`, and every
editor/library component. Rows the source document itself marked **C. Could not verify** (e.g.
action reorder, corner-radius field, per-leg distance, dedicated "Validate Route" button) are not
DJI-confirmed features and are excluded from this gap list even where our app also lacks them.
Rows marked **B. Not available** in DJI's own UI (exposure/ISO/focus/white-balance, thermal
controls on M4D, battery/range estimate) are Not Applicable here since there is nothing to match.

## Summary
- Total checklist items reviewed: ~147 (across the document's §1–§20 tables)
- Fully implemented: ~128
- Partially implemented: 4
- Missing: 10
- Not applicable (confirmed absent in DJI's own M4D UI): 5 (exposure/ISO/shutter/focus/white-balance, thermal camera controls, battery/range estimate)

## Features To Add / Complete

### Feature: Matrice 4D Series accessory selector (AS1 Speaker / AL1 SpotLight)
- Status: Missing
- DJI behavior/reference: §1 — the Create Route dialog shows an "Accessories" row for Matrice 4D
  Series with togglable **AS1 Speaker** and **AL1 SpotLight** checkboxes.
- Current implementation: `backend/constants.js:61,69` declares `accessories: ['AS1 Speaker', 'AL1 SpotLight']`
  on both the `M4E` and `M4D` series entries, but nothing reads that field. `grep` across
  `frontend/src` finds no UI reference to "accessories" anywhere, and `waylineCreateSchema` /
  `waylineUpdateSchema` in [schemas.js](backend/schemas.js) have no accessory field — only
  `payload_model`.
- What needs to be added/completed: An accessory toggle row in
  [CreateRouteDialog.jsx](frontend/src/components/library/CreateRouteDialog.jsx) (next to the
  existing M400 payload picker branch), a schema field to persist the selection, and plumbing
  through `store.js`'s `emptyMission`/`saveMission`.
- Relevant code locations: [CreateRouteDialog.jsx:195-217](frontend/src/components/library/CreateRouteDialog.jsx:195), [backend/constants.js:59-69](backend/constants.js:59), [backend/schemas.js:105-112](backend/schemas.js:105)
- Dependencies/considerations: Purely cosmetic/metadata — doesn't affect WPML export since DJI's
  own accessory selection isn't part of the KMZ schema captured in §7 of feature-reference.md.
- Priority: Low

### Feature: Smart Low-Light toggle for the base Matrice 4D model
- Status: Partial
- DJI behavior/reference: §1 — "Smart Low-Light toggle... Off by default" was observed directly on
  the **Matrice 4D** test route (the document's stated test aircraft), not just the 4TD variant.
- Current implementation: `GlobalSettingsPanel.jsx` only renders the Smart Low-Light toggle when
  `modelEntry?.smartLowLight` is true. In `backend/constants.js`, `smartLowLight: true` is set on
  `M30T` and `M4TD` but **not** on the base `M4D` model entry (line 71:
  `M4D: { label: 'Matrice 4D', lenses: ['visible'] }`).
- What needs to be added/completed: Add `smartLowLight: true` to the `M4D` model entry in
  `AIRCRAFT.M4D.models.M4D`.
- Relevant code locations: [backend/constants.js:71](backend/constants.js:71), [GlobalSettingsPanel.jsx:78-86](frontend/src/components/editor/GlobalSettingsPanel.jsx:78)
- Dependencies/considerations: One-line data fix; no UI code change needed since the panel already
  keys off the model metadata.
- Priority: Medium

### Feature: Bypass Obstacle toggle for the base Matrice 4D model
- Status: Partial
- DJI behavior/reference: §12 — "Bypass Obstacle | Route | Advanced Settings, toggle switch (off
  by default)" was observed on the M4D test route itself (per the document's methodology, the test
  aircraft throughout is Matrice 4D, not 4TD).
- Current implementation: Same pattern as Smart Low-Light — `bypassObstacle: true` is only set on
  `AIRCRAFT.M4D.models.M4TD`, not on `AIRCRAFT.M4D.models.M4D`, so
  [GlobalSettingsPanel.jsx:213](frontend/src/components/editor/GlobalSettingsPanel.jsx:213) never
  shows the row for the base M4D model.
- What needs to be added/completed: Add `bypassObstacle: true` to the `M4D` model entry.
- Relevant code locations: [backend/constants.js:71](backend/constants.js:71), [GlobalSettingsPanel.jsx:213-221](frontend/src/components/editor/GlobalSettingsPanel.jsx:213)
- Dependencies/considerations: Same fix as Smart Low-Light above — both can land in one edit to the
  `M4D` model entry.
- Priority: Medium

### Feature: Gimbal Yaw incorrectly offered on the base Matrice 4D model
- Status: Partial
- DJI behavior/reference: §7 — "Gimbal Yaw / Roll: only 'Tilt' (pitch) was exposed as a labelled
  control; no separate yaw/roll slider found for the gimbal itself" on the Matrice 4D test route.
  This matches feature-reference.md §9b's finding for the 4TD sibling (no Gimbal Yaw, only 3
  attitude actions auto-attached instead of 4).
- Current implementation: `excludedActions: ['gimbalYaw']` is only set on `AIRCRAFT.M4D.models.M4TD`
  in `backend/constants.js`. The base `M4D` model has no `excludedActions`, so
  `actionMenuFor()`/`attitudeActionsFor()` in [actions.js](frontend/src/lib/actions.js:192) return
  the full 12-entry menu including Gimbal Yaw, and a new waypoint on a Matrice 4D route
  auto-attaches all four attitude actions (Aircraft Yaw, **Gimbal Yaw**, Gimbal Tilt, Camera Zoom)
  via `attitudeActions()` in [store.js:42-70](frontend/src/store.js:42) instead of the three the
  document confirms for this airframe.
- What needs to be added/completed: Add `excludedActions: ['gimbalYaw']` to the `M4D` model entry
  so both the action menu and the auto-attach behavior exclude it, matching the 4TD sibling.
- Relevant code locations: [backend/constants.js:71](backend/constants.js:71), [frontend/src/lib/actions.js:192-202](frontend/src/lib/actions.js:192), [frontend/src/store.js:42-70](frontend/src/store.js:42)
- Dependencies/considerations: This is a data/config bug, not a missing feature — the exclusion
  mechanism already exists and works correctly for the 4TD; it's simply not applied to the base
  M4D model it should also cover.
- Priority: High (produces an incorrect action set / wrong WPML export for the actual audited aircraft)

### Feature: Camera Zoom default ratio for Matrice 4D
- Status: Partial
- DJI behavior/reference: §1/§8 — Camera Zoom action added via the "More" menu defaults to **7×**
  on the Matrice 4D test route (quick-edit override separately defaults to 1×).
- Current implementation: `defaultParams('zoom', settings)` in
  [actions.js:64-66](frontend/src/lib/actions.js:64) falls back to `settings.defaultZoomRatio ?? 5`.
  No `defaultZoomRatio` is set on the base `M4D` model entry in `backend/constants.js` (only `M4TD`
  has `defaultZoomRatio: 1`), so a Camera Zoom action on a Matrice 4D route defaults to 5×, matching
  neither of the two values the document records for this aircraft.
- What needs to be added/completed: Add `defaultZoomRatio: 7` to the `M4D` model entry.
- Relevant code locations: [backend/constants.js:71](backend/constants.js:71), [frontend/src/lib/actions.js:64-66](frontend/src/lib/actions.js:64)
- Dependencies/considerations: Minor cosmetic default; does not block route creation or export.
- Priority: Low

### Feature: Smart Capture (BETA) — Start/End Intelligent Detection action
- Status: Missing
- DJI behavior/reference: §8/§9 — a sixth quick-action strip entry, "Smart Capture (BETA)," which
  expands into a paired **Start Intelligent Detection** / **End Intelligent Detection** action set,
  structurally identical to the interval-shot start/stop pairing.
- Current implementation: `ACTION_TYPES` in `backend/constants.js` and `ACTION_MENU`/`QUICK_ACTIONS`
  in [actions.js](frontend/src/lib/actions.js:16-32) have no smart-capture or intelligent-detection
  entries anywhere in the codebase (confirmed by grep across both frontend and backend).
- What needs to be added/completed: New `startIntelligentDetection` / `stopIntelligentDetection`
  action types (or similar), added to `ACTION_TYPES`, `ACTION_LABELS`, `ACTION_ACTUATOR` (a WPML
  mapping would need to be invented since this is a BETA feature not in the documented WPML schema),
  the quick-action strip, and paired start/stop availability rules in `actionAvailability()`
  mirroring the existing recording/interval-shot state machine.
- Relevant code locations: [backend/constants.js:177-242](backend/constants.js:177), [frontend/src/lib/actions.js:16-35](frontend/src/lib/actions.js:16), [frontend/src/lib/actions.js:128-184](frontend/src/lib/actions.js:128)
- Dependencies/considerations: The document itself couldn't fully verify AI-detection parameters
  or WPML serialization for this BETA feature, so implementation would need to invent semantics.
  Flagged as missing but genuinely low-confidence to build correctly.
- Priority: Low

### Feature: Map search tool
- Status: Missing
- DJI behavior/reference: §3 — a magnifying-glass search box with a scope dropdown, searching
  location/annotation/device/model/photo.
- Current implementation: [MapCanvas.jsx](frontend/src/components/editor/MapCanvas.jsx) has no
  search control anywhere in its toolbar (confirmed by reading the full file — only 2D/3D toggle,
  zoom ±, fit-to-route, and basemap switcher are present).
- What needs to be added/completed: A map search box (place-name lookup, at minimum) added to the
  map's control cluster.
- Relevant code locations: [MapCanvas.jsx:825-889](frontend/src/components/editor/MapCanvas.jsx:825)
- Dependencies/considerations: Would need a geocoding provider (e.g. Nominatim, consistent with the
  existing OpenStreetMap tile usage) since none is currently wired in.
- Priority: Low

### Feature: Map annotation, measurement, and rectangle/circle draw tools
- Status: Missing
- DJI behavior/reference: §3 — dedicated point-annotation, line-measurement, rectangle-draw and
  circle-draw tools on the map toolbar, independent of mapping-route area/linear drawing.
- Current implementation: The only drawing affordance in `MapCanvas.jsx` is the mapping-route
  polygon/centre-line drawing (`drawMode='area'|'linear'`), which is a route-authoring tool, not a
  general-purpose annotation/measurement layer. There is no freestanding marker, ruler, rectangle
  or circle tool.
- What needs to be added/completed: A separate annotation-tool mode (point/line/rectangle/circle)
  with its own color palette, independent of route geometry, plus persistence if annotations should
  survive a reload.
- Relevant code locations: [MapCanvas.jsx:266-300](frontend/src/components/editor/MapCanvas.jsx:266) (props/toolbar), [MapCanvas.jsx:962-991](frontend/src/components/editor/MapCanvas.jsx:962) (existing draw-mode banner pattern to extend)
- Dependencies/considerations: Lower value for a mission-planning tool than for DJI's broader
  FlightHub project workspace — these are general project-annotation tools, not wayline-specific.
- Priority: Low

### Feature: Compass / heading indicator widget on the map
- Status: Missing
- DJI behavior/reference: §3 — a circular compass widget in the map corner showing live heading.
- Current implementation: No compass widget exists in `MapCanvas.jsx`. Heading is only visible
  indirectly via the gimbal-orientation fan overlay (`display.displayGimbalOrientation`, off by
  default) and per-waypoint numeric fields in `WaypointPanel.jsx`.
- What needs to be added/completed: A small compass overlay reflecting the selected waypoint's (or
  route's) heading.
- Relevant code locations: [MapCanvas.jsx:824-889](frontend/src/components/editor/MapCanvas.jsx:824)
- Priority: Low

### Feature: GEO Zone / Task Area map overlays
- Status: Missing
- DJI behavior/reference: §3/§13 — yellow/green shaded "GEO ZONE" and "TASK AREA" polygons rendered
  on the map by default, pre-existing organizational data layered under the route.
- Current implementation: No geofence/GEO-zone data model or overlay exists anywhere in
  `backend/schemas.js`, `repository.js`, or `MapCanvas.jsx`.
- What needs to be added/completed: A geofence/zone data source and a read-only overlay layer. This
  is infrastructure DJI's org-wide FlightHub project provides that this single-tenant app has no
  equivalent for.
- Relevant code locations: [MapCanvas.jsx](frontend/src/components/editor/MapCanvas.jsx) (rendering), backend has no relevant schema
- Dependencies/considerations: Requires deciding what "geofence" data means for this app (there is
  no multi-project/org concept here) — likely out of scope without a broader product decision.
- Priority: Low

### Feature: Persistent coordinate / altitude / datum readout and scale bar
- Status: Missing
- DJI behavior/reference: §3 — a bottom status bar showing scale bar, zoom %, ASL, HAE, and a
  "WGS 84" datum label, always visible during editing (not just in a settings panel).
- Current implementation: Latitude/longitude/altitude are only exposed as editable fields inside
  [WaypointPanel.jsx](frontend/src/components/editor/WaypointPanel.jsx) when a waypoint is
  selected — there is no persistent map-chrome readout, scale bar, or datum label.
- What needs to be added/completed: A persistent bottom-bar overlay on `MapCanvas.jsx` with a scale
  bar (Leaflet has a built-in `L.control.scale`) and ASL/HAE/datum text.
- Relevant code locations: [MapCanvas.jsx:824-889](frontend/src/components/editor/MapCanvas.jsx:824)
- Priority: Low

### Feature: Virtual-flight / FPV authoring, camera preview, Snapshot Preview & AI Spot-Check
- Status: Missing (previously documented as an intentional scope decision)
- DJI behavior/reference: §0/§4 — waypoints are authored by "flying" a virtual aircraft with a live
  FPV camera cone and picture-in-picture preview; the Take Photo (Fixed Angle) action shows a
  rendered "Snapshot Preview" thumbnail with an AI Spot-Check button.
- Current implementation: `docs/feature-reference.md` §4 and §12 already record this as a deliberate
  trade-off ("Need a 3D terrain and scene service this build has no access to"), replaced by
  click-to-place map authoring. This is confirmed still true — there is no FPV camera view or
  snapshot-preview UI anywhere in the codebase.
- What needs to be added/completed: Nothing planned without a 3D terrain/scene service; included
  here only for completeness against the attached checklist, not as a newly discovered gap.
- Relevant code locations: N/A — architectural decision recorded in [docs/feature-reference.md §12](docs/feature-reference.md)
- Dependencies/considerations: Would require a 3D terrain/elevation service and a real-time render
  pipeline — a substantial undertaking disproportionate to a mission-planning tool.
- Priority: Low

### Feature: Merge routes
- Status: Missing (previously documented as an intentional scope decision)
- DJI behavior/reference: §17/§2 — a "Merge" entry in the route card's `…` overflow menu, enabled
  when multiple routes are selected, combining them into one.
- Current implementation: `docs/feature-reference.md` §12 already records this as deliberately not
  built ("their dialogs/behaviour were not exercised... building them would mean inventing
  semantics"). `RouteCard.jsx`'s `OverflowMenu` has Rename/Move/Duplicate/Download/Lock/Delete but
  no Merge, and there's no multi-select in `Library.jsx` to enable it.
- What needs to be added/completed: Multi-select in the route list, plus a merge endpoint that
  concatenates waypoints/actions from selected waylines (semantics would need to be decided, since
  DJI's own behavior here was never verified either).
- Relevant code locations: [RouteCard.jsx:57-68](frontend/src/components/library/RouteCard.jsx:57), [Library.jsx](frontend/src/pages/Library.jsx)
- Priority: Low

### Feature: Bulk select / export / delete from the library toolbar
- Status: Missing
- DJI behavior/reference: §17 — small download/trash/link icons above the route list operating on a
  multi-selection of routes.
- Current implementation: `Library.jsx` tracks only a single `selectedId` (used for the preview
  pane); there is no multi-select checkbox state and no bulk-action toolbar. Only the per-card
  overflow menu (single-route actions) exists.
- What needs to be added/completed: Multi-select checkboxes on `RouteCard`, a bulk-action bar, and
  corresponding batch endpoints (or client-side loops over the existing single-item endpoints).
- Relevant code locations: [Library.jsx:277-419](frontend/src/pages/Library.jsx:277), [RouteCard.jsx](frontend/src/components/library/RouteCard.jsx)
- Priority: Low

### Feature: Two-click confirm on action deletion
- Status: Partial
- DJI behavior/reference: §9/§19 — deleting a queued action requires a first click that shows a
  "Click again to delete waypoint action" tooltip, then a second click to execute — a deliberate
  anti-accidental-deletion pattern.
- Current implementation: In [ActionEditor.jsx:492-500](frontend/src/components/editor/ActionEditor.jsx:492),
  the trash icon calls `removeAction(waypointIndex, index)` directly on a single click, with only a
  static `title="Delete action"` tooltip — no confirmation step. (By contrast, wayline deletion in
  `Library.jsx` does use a `window.confirm` dialog, so the pattern exists elsewhere in the app but
  not for actions.)
- What needs to be added/completed: A two-click (or otherwise confirmed) delete on the action pager,
  matching the pattern already used for wayline deletion.
- Relevant code locations: [ActionEditor.jsx:492-500](frontend/src/components/editor/ActionEditor.jsx:492)
- Priority: Low

## Recommended Implementation Order
1. **Fix the Matrice 4D model config bug** — add `excludedActions: ['gimbalYaw']`, `smartLowLight: true`, `bypassObstacle: true`, and `defaultZoomRatio: 7` to `AIRCRAFT.M4D.models.M4D` in [backend/constants.js](backend/constants.js:71). This is a single, low-risk data edit that fixes four related findings (Gimbal Yaw, Smart Low-Light, Bypass Obstacle, Camera Zoom default) and corrects the actual action set/export for the aircraft this document audited.
2. **Two-click delete confirmation on actions** — small, contained UI change, closes an accidental-data-loss gap.
3. **Accessories selector** for M4D/M4E series in the Create Route dialog — self-contained UI + schema addition.
4. **Smart Capture (BETA) action pair** — larger effort, lower confidence in exact semantics; consider after the above land.
5. **Map chrome additions** (search, compass, persistent coordinate/scale readout, annotation/measurement tools, GEO zone overlays) — cosmetic/navigational, no impact on mission correctness; batch as a single "map chrome parity" pass if pursued.
6. **Library bulk-select / Merge routes** — defer; DJI's own behavior here was never verified by the source audit either, so semantics would be invented either way.
7. **Virtual-flight/FPV authoring** — leave as the already-documented, deliberate architectural trade-off unless a 3D terrain service becomes available.
