# DJI Matrice 4D — Implementation Plan

Validated against the current codebase (no code changed in this pass). Each gap from
`docs/DJI_MATRICE_4D_FEATURE_GAPS.md` is re-verified below with the exact code path that produces
the current behavior, then classified.

Classification legend: **QUICK FIX** · **FEATURE IMPLEMENTATION** · **ARCHITECTURAL CHANGE** ·
**DELIBERATE SCOPE DIFFERENCE** · **NEEDS FURTHER VERIFICATION**

---

## 1. Matrice 4D model configuration (`M4D` vs `M4TD`)

- **Current status — confirmed genuine bug.** In `backend/constants.js:71`, the base model entry is:
  ```js
  M4D: { label: 'Matrice 4D', lenses: ['visible'] },
  ```
  while its sibling at `constants.js:72-83` carries `smartLowLight: true`, `defaultZoomRatio: 1`,
  `excludedActions: ['gimbalYaw']`, `bypassObstacle: true`. `M4D` has none of these.

  Traced consumers, all confirmed reading `modelEntry`/`model?.excludedActions` etc. with no
  fallback other than "absent = not excluded / not shown":
  - `frontend/src/lib/actions.js:192-202` (`actionMenuFor`, `attitudeActionsFor`) — for the base
    M4D model, `excluded` is `[]`, so the "More" action menu includes **Gimbal Yaw**, and the
    attitude-sync helper captures **4** attitude actions instead of 3.
  - `frontend/src/store.js:274-280, 321-327, 458-467` (`attitudeActions()` callers: `addWaypoint`,
    `insertWaypoint`, `recordCurrentAttitude`) — same effect: a new waypoint on a Matrice 4D route
    auto-attaches `rotateYaw, gimbalYaw, gimbalTilt, zoom` when `syncAttitudeOnNewWaypoint` is on
    (the default), instead of the 3 the source document confirms for this airframe family.
  - `frontend/src/components/editor/GlobalSettingsPanel.jsx:78, 213` — `modelEntry?.smartLowLight`
    and `modelEntry?.bypassObstacle` are both falsy for base M4D, so neither settings row renders.
  - `frontend/src/lib/actions.js:66` / `store.js:64` / `ActionEditor.jsx:423` — `defaultZoomRatio`
    is `undefined` for M4D, so `defaultParams('zoom', …)` falls back to the generic `?? 5`, not the
    document's observed 7×.
- **Classification: QUICK FIX.** The exclusion/flag mechanism already exists, is already exercised
  correctly by the `M4TD` sibling, and needs no new code — only four data fields added to one
  object literal.
- **Exact files/components affected:** `backend/constants.js` only (one object literal, lines
  67-85). No frontend or schema changes required — every consumer already reads these fields
  defensively.
- **Dependencies:** None. Independent of every other item in this plan.
- **Implementation approach:** Add to `AIRCRAFT.M4D.models.M4D`:
  `smartLowLight: true, defaultZoomRatio: 7, excludedActions: ['gimbalYaw'], bypassObstacle: true`.
- **Risk level:** Low. Pure data change; every field is optional-with-fallback everywhere it's
  read, so this cannot throw or change behavior for any other aircraft.
- **Testing requirements:**
  - Create a new Waypoint Route with aircraft = Matrice 4D (base model), add a waypoint with
    "synchronize attitude" on → verify only 3 attitude actions attach (no Gimbal Yaw).
  - Open the "Add action" menu on a Matrice 4D waypoint → verify Gimbal Yaw is absent.
  - Open Flight Route Settings for a Matrice 4D route → verify Smart Low-Light and Bypass Obstacle
    rows appear.
  - Add a Camera Zoom action on a Matrice 4D waypoint → verify default is 7×.
  - Regression: repeat all four checks for **M4TD** and for **M30T** to confirm unaffected.
  - Existing `backend/test` and any store/action unit tests should be re-run.
- **Phase: 1 (do first — isolated, zero-risk, fixes incorrect behavior for the exact aircraft this
  audit targets).**

---

## 2. Two-click confirm on action deletion

- **Current status — confirmed.** `frontend/src/components/editor/ActionEditor.jsx:492-500`: the
  trash button's `onClick` calls `removeAction(waypointIndex, index)` directly; no confirmation
  state exists in the component. `store.js:474-482` (`removeAction`) performs the deletion
  unconditionally when called.
- **Classification: QUICK FIX.** Contained to one button in one component; no state/schema impact.
- **Exact files/components affected:** `frontend/src/components/editor/ActionEditor.jsx` (the
  delete button around line 492-500). Optionally reuse the pattern already proven in
  `frontend/src/components/library/RouteCard.jsx`'s rename/delete flow, but a simpler
  "arm on first click, execute on second click within N seconds" local `useState` is enough — no
  need for `window.confirm`, which is what wayline delete uses today and would be a worse match to
  the audited DJI behavior (in-place tooltip flip, not a modal).
- **Dependencies:** None.
- **Implementation approach:** Add local `const [armed, setArmed] = useState(false)`; first click
  sets `armed(true)` and changes the tooltip/icon to a warning state; second click (or a
  short-lived timeout that disarms) calls `removeAction`. Reset `armed` when the selected
  action/waypoint changes (existing `selectedAction`/`selectedWaypoint` from the store).
- **Risk level:** Low. Purely additive UI state; `removeAction` behavior itself is unchanged.
- **Testing requirements:** Click delete once → action remains, tooltip/visual changes. Click again
  → action removed. Select a different action/waypoint after arming → arm state resets (no stale
  "primed to delete" state carried to the wrong action). Keyboard `Delete`/`Backspace` shortcut in
  `useEditorShortcuts.js` still deletes in one step — decide explicitly whether to leave that
  as-is (keyboard shortcuts are a different interaction model, arguably fine to keep single-step)
  or gate it too; recommend leaving the keyboard shortcut alone since the DJI document only
  describes the on-canvas trash-icon behavior.
- **Phase: 2 (safe, small, no dependencies).**

---

## 3. Accessories selector (AS1 Speaker / AL1 SpotLight)

- **Current status — confirmed missing.** `backend/constants.js:61,69` declares
  `accessories: ['AS1 Speaker', 'AL1 SpotLight']` on the `M4E` and `M4D` series objects; nothing
  reads it. `frontend/src/components/library/CreateRouteDialog.jsx:195-217` only branches on
  `seriesEntry?.payloads` (the M400 payload picker) — there is no `seriesEntry?.accessories`
  branch. `backend/schemas.js` (`waylineCreateSchema`/`waylineUpdateSchema`) has no field to persist
  a selection; `frontend/src/store.js`'s `emptyMission()` has no accessory field either.
- **Classification: FEATURE IMPLEMENTATION.** Requires new UI (checkbox row), a new persisted
  field, and store plumbing — more than a data-only fix, but self-contained and low-complexity.
- **Exact files/components affected:**
  - `backend/schemas.js` — add an optional `accessories: z.array(z.string()).optional()` (or
    similar) to the wayline schemas.
  - `backend/constants.js` — no change needed (data already present).
  - `frontend/src/components/library/CreateRouteDialog.jsx` — new checkbox group rendered when
    `seriesEntry?.accessories` exists, alongside the existing payload-picker branch.
  - `frontend/src/store.js` — `emptyMission()` and `saveMission()`'s payload builder need an
    `accessories` field carried through.
  - `frontend/src/pages/Library.jsx` (`handleCreateRoute`) — pass the selection through the
    `navigate(...)` query params the same way `payload_model` is passed today (line 229-240).
  - `frontend/src/pages/Editor.jsx` — read the query param into the new mission on create (mirrors
    how `payload` is currently read; needs to be located and confirmed before implementation).
- **Dependencies:** None on other items. Confirm `Editor.jsx`'s query-param intake logic before
  starting (not yet re-read in this pass — see item 3a below).
- **Implementation approach:** Mirror the existing `payload_model` plumbing exactly (same
  create-dialog → query-string → editor → store → schema path), substituting a multi-select
  checkbox group for the single `<select>`.
- **Risk level:** Low-medium. Touches the create-route flow (dialog → navigate → editor bootstrap
  → save payload) in four files, so more surface than a quick fix, but no existing behavior needs
  to change — this is additive.
- **Testing requirements:** Create a Matrice 4D route, toggle both accessories, save, reload, verify
  persisted. Create a Matrice 30T route (no `accessories` on that series) → verify no accessory UI
  renders and nothing breaks. Verify `.kmz` export/import round-trip does not error (accessories are
  not part of the documented WPML schema in feature-reference.md §7, so they should be excluded
  from `buildKmz`/`parseKmz` rather than invented into it).
- **Phase: 3.**

  **3a. NEEDS FURTHER VERIFICATION (sub-item):** Exactly how `Editor.jsx` currently reads
  `payload_model` from the route's query string on creation was not re-confirmed in this pass
  (only `Library.jsx`'s `handleCreateRoute` producing the query string was verified). Read
  `frontend/src/pages/Editor.jsx`'s mission-bootstrap logic before implementing, to mirror the
  exact pattern rather than inventing a divergent one.

---

## 4. Smart Capture (BETA) — Start/End Intelligent Detection

- **Current status — confirmed missing.** No `smartCapture`/`intelligentDetection` identifiers
  exist anywhere in `backend/constants.js`, `frontend/src/lib/actions.js`, or any component
  (re-confirmed via the earlier grep in the audit; not repeated here to save tokens since nothing
  in the tree has changed).
- **Classification: NEEDS FURTHER VERIFICATION.** The source audit document itself states the
  action's exact parameters, confidence thresholds, and WPML serialization were not established —
  it is a DJI BETA feature the auditor could not fully characterize. Implementing it now means
  inventing an action schema and a WPML `actionActuatorFunc` that doesn't exist in
  `docs/feature-reference.md` §7's verified mapping table. This fails the "do not blindly implement
  based on the name" instruction.
- **Exact files/components likely affected (if pursued later):** `backend/constants.js`
  (`ACTION_TYPES`, `ACTION_LABELS`, `ACTION_ACTUATOR`), `frontend/src/lib/actions.js`
  (`ACTION_MENU`, `defaultParams`, `actionAvailability` — needs a new paired-state rule alongside
  the existing recording/interval-shot state machine in `cameraStateAt`), `backend/wpml.js` (export
  mapping — currently unknown target), `ActionEditor.jsx` (`ActionParams` switch).
- **Dependencies:** A real WPML sample or further DJI documentation establishing the actuator
  function and parameters, since `backend/wpml.js`'s export must produce a valid `.kmz` and the
  current implementation only knows the four actuator functions verified in feature-reference.md.
- **Recommended next step before implementation:** Do not implement from the action's name alone.
  Either source a real exported `.kmz` containing this action, or explicitly scope it as
  "UI-only / not exported" if a placeholder is wanted, and get sign-off on that reduced scope.
- **Risk level:** N/A (blocked pending verification).
- **Phase: Deferred — revisit only after the WPML mapping is independently confirmed.**

---

## 5. Map chrome: search tool, compass indicator, GEO zone overlays, persistent coordinate/scale readout, generic annotation/measurement/rectangle/circle tools

- **Current status — confirmed missing**, re-verified against
  `frontend/src/components/editor/MapCanvas.jsx`: the only toolbar controls are 2D/3D toggle,
  zoom ± (lines 849-866), fit-to-route (868-878), and basemap switcher (880-888). No search,
  compass, scale bar, datum readout, or generic annotation/measurement tools exist. Mapping-route
  polygon/centre-line drawing (`drawMode`) is a distinct, route-authoring-specific mechanism, not a
  general annotation layer.
- **Classification (mixed — split per sub-feature):**
  - **Search tool:** FEATURE IMPLEMENTATION — needs a geocoding provider not currently wired in
    anywhere in the codebase (no API key/service reference found in `.env`-style config or `api.js`).
  - **Compass widget:** FEATURE IMPLEMENTATION — small, self-contained (heading is already computed
    by `frontend/src/lib/geo.js`'s `headingAt`/`bearingBetween`, reused by the gimbal-orientation
    layer at `MapCanvas.jsx:221-257`, so the data exists — only the widget is missing).
  - **Persistent coordinate/scale/datum readout:** QUICK FIX-leaning FEATURE IMPLEMENTATION —
    Leaflet ships `L.control.scale`; ASL/HAE/datum are display-only text pulled from the selected
    waypoint or map center, no new data model needed.
  - **GEO Zone / Task Area overlays:** ARCHITECTURAL CHANGE — there is no geofence/zone concept
    anywhere in `backend/schemas.js` or `repository.js`; this app has no multi-project/org model
    the way DJI FlightHub does, so "GEO Zone" data would need an invented source of truth.
  - **Generic annotation/measurement/rectangle/circle draw tools:** FEATURE IMPLEMENTATION —
    would duplicate/extend the existing `drawMode` mechanism but for free-standing map markup
    unrelated to route geometry; needs its own state and (if persisted) schema.
- **Exact files/components affected:** `frontend/src/components/editor/MapCanvas.jsx` (all), plus
  new schema/endpoints only for GEO zones and persisted annotations.
- **Dependencies:** Search needs an external geocoding service decision. GEO zones need a product
  decision on what "zone" data means for a single-tenant app with no org/project layer.
- **Implementation approach:** Treat compass + scale/datum readout as one small "map chrome" batch
  (lowest effort, matches existing data). Treat search, generic annotation tools, and GEO zones as
  separate, larger, and lower-value efforts given this is a single-drone mission planner, not a
  multi-project fleet workspace.
- **Risk level:** Low for compass/readout (additive, view-only). Medium for annotation tools
  (new interaction state that must not conflict with existing `drawMode`/`placementMode` click
  handling in `MapCanvas.jsx:429-443`). Low-medium for GEO zones (additive schema, but scope is
  undefined).
- **Testing requirements:** Compass/readout — verify no interference with existing map click
  handling, 3D tilt mode, or drag-to-reorder. Annotation tools — verify they don't intercept clicks
  meant for waypoint placement (`handleMapClick` already branches on `placementMode`/`drawMode`;
  a third mode must not break that branch order).
- **Phase: 4 (compass + scale/datum readout only). Search, generic annotation tools, and GEO zones:
  defer — lower value for this app's single-tenant scope; revisit only if requested explicitly.**

---

## 6. Virtual-flight / FPV authoring, live camera preview, Snapshot Preview & AI Spot-Check

- **Current status — confirmed absent, and already a recorded, deliberate decision.**
  `docs/feature-reference.md` §4 and §12 (pre-existing project documentation, not part of this
  audit) explicitly record this as out of scope: "Need a 3D terrain and scene service this build
  has no access to. Replaced by click-to-add authoring." Nothing in the current codebase
  contradicts that — no FPV/camera-preview component exists.
- **Classification: DELIBERATE SCOPE DIFFERENCE.** This was a considered architectural decision
  made before this audit, for a sound technical reason (no 3D terrain/scene service), and the
  click-to-place replacement already preserves the underlying data model (waypoints, attitude
  actions, etc.).
- **Recommendation:** Do not implement. Re-litigate only if a terrain/3D scene service becomes
  available as a project dependency.
- **Phase: Out of scope.**

---

## 7. Merge routes

- **Current status — confirmed missing**, and also a recorded prior decision.
  `docs/feature-reference.md` §12: "their dialogs/behaviour were not exercised... building them
  would mean inventing semantics rather than replicating them." `RouteCard.jsx`'s `OverflowMenu`
  (lines 57-68) has Rename/Move/Duplicate/Download/Lock/Delete but no Merge.
  `backend/repository.js` exposes `listWaylines, getWayline, createWayline, updateWayline,
  patchWayline, deleteWayline, duplicateWayline, waylineExists` — no merge primitive.
- **Classification: DELIBERATE SCOPE DIFFERENCE** (leaning), with a **NEEDS FURTHER VERIFICATION**
  caveat: the source audit document itself never exercised DJI's Merge dialog, so there is no
  verified reference behavior to reproduce — implementing it would mean inventing semantics DJI's
  own product behavior was never confirmed to have. Building an "invented" merge risks producing
  something that looks authoritative but isn't validated against anything.
- **Recommendation:** Do not implement unless/until real DJI merge semantics are sourced (e.g. a
  support answer or a fresh live-UI exploration session). If a merge-like feature is wanted
  regardless, treat it as this app's own designed feature (as `feature-reference.md` §11.7 already
  does for the drone-fleet/assignment feature), not a DJI-parity item.
- **Phase: Out of scope, pending new source material.**

---

## 8. Bulk select / export / delete from the library toolbar

- **Current status — confirmed missing.** `frontend/src/pages/Library.jsx` tracks only a single
  `selectedId` (line 55, used solely to drive the preview pane at line 405). No multi-select
  checkbox state, no bulk-action toolbar. Per-route actions exist only via `RouteCard`'s per-card
  overflow menu.
- **Classification: FEATURE IMPLEMENTATION.** New selection state, new toolbar, and either batch
  endpoints or client-side loops over the existing single-item endpoints
  (`api.waylines.remove`, `api.waylines.kmzUrl` already exist per-item).
- **Exact files/components affected:** `frontend/src/pages/Library.jsx` (selection state, new
  toolbar UI), `frontend/src/components/library/RouteCard.jsx` (add a checkbox, currently has none
  — its `onClick`/`onDoubleClick` handlers at lines 144-145 would need to coexist with a checkbox
  click without triggering select/open).
- **Dependencies:** None blocking; independent of other items.
- **Implementation approach:** Add a `selectedIds: Set` alongside the existing single `selectedId`
  (which drives the preview pane and should probably remain separate — DJI's own single-click
  "select for preview" vs. checkbox "select for bulk action" are different interactions and the
  audit document doesn't establish DJI conflates them). Batch delete can reuse
  `DELETE /waylines/:id` in a loop; batch download can trigger multiple `handleDownload` calls or,
  better, a zip-producing backend endpoint (bigger scope — recommend the client-side-loop approach
  first).
- **Risk level:** Low-medium. Must not disturb the existing single-select preview flow.
- **Testing requirements:** Multi-select several routes, bulk-delete → all removed, list refreshes
  correctly. Bulk-download → each file downloads without navigation side effects. Locked routes
  must be excluded from bulk-delete (mirrors the existing per-card lock guard at
  `RouteCard.jsx:67` and the backend's `409` lock check in `waylines.js`).
- **Phase: 5 (lower priority; no DJI-verified precedent for exact toolbar behavior beyond icon
  presence, per the source audit's own §10.4 "not exercised" note — build to this app's own
  reasonable design, not a guessed DJI replica).**

---

## Priority Summary

### 1. Highest-priority fixes
- **Matrice 4D model configuration bug** (§1 above) — genuine bug, currently produces an incorrect
  action set (extra Gimbal Yaw) and missing settings (Smart Low-Light, Bypass Obstacle) for the
  exact aircraft the audit targeted. Single-file, four-field fix in `backend/constants.js`.

### 2. Safe quick wins
- Two-click confirm on action deletion (`ActionEditor.jsx`).
- (Bundled with #1) Camera Zoom default ratio for M4D — same one-line data fix.

### 3. Larger features (worth doing, properly scoped)
- Accessories selector (AS1 Speaker / AL1 SpotLight) — self-contained, mirrors existing
  `payload_model` plumbing.
- Compass widget + persistent coordinate/scale/datum readout on the map — additive, uses data
  already computed elsewhere in the codebase.
- Bulk select/export/delete in the library — no DJI-verified exact behavior to match, but a
  reasonable, independently-designed addition.

### 4. Features that should remain out of scope
- **Virtual-flight/FPV authoring, live camera preview, Snapshot Preview + AI Spot-Check** —
  deliberate, previously-documented architectural decision (no 3D terrain/scene service).
- **Merge routes** — DJI's own reference behavior was never verified by the source audit;
  implementing it now means inventing semantics.
- **Smart Capture (BETA) / Intelligent Detection actions** — DJI BETA feature with no verified
  parameters or WPML mapping; implementing from the name alone would be a guess.
- **GEO Zone / Task Area overlays** — requires an org/project data model this single-tenant app
  doesn't have; undefined scope.
- **Map search tool, generic annotation/measurement/rectangle/circle tools** — lower value for a
  single-drone mission planner than for DJI's multi-project fleet workspace; defer unless
  explicitly requested.
