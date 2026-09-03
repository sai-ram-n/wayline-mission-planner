# Waypoint camera visuals — coverage cones, zoom indicator, heading marker

**Explored 2026-09-03** on the live FlightHub 2 wayline module, project *DEMO-A Warehouse*, on the
existing route `WMP-F-M4TD-2D-Explore` (Waypoint Route · Matrice 4D Series · **Matrice 4TD**).

Companion to `feature-reference.md` and `m4td-waypoint-editor.md`. It answers a question those two
documents could not: what the coloured shapes on the map actually are.

> **Why this document exists.** `feature-reference.md:166` records a single sentence — *"A green
> camera-frustum cone projects from the virtual aircraft"* — with no colour values, no angle and no
> geometry, and the M4TD session that produced `m4td-waypoint-editor.md` was held to the 2D
> top-down view and never described these shapes at all. Everything below replaces that with
> measurement. That one sentence turns out to be **wrong on two counts**: there are *two* cones, and
> the larger, more prominent one is **amber**, not green.

---

## 0. Method, and why these numbers are trustworthy

The FlightHub map is a **Cesium WebGL globe**, not DOM. No computed style exists to sample, so the
`§10 Visual style` technique used for the panels does not apply here. Values below were obtained by:

- capturing the live `Cesium.Scene` from one frame of the render loop;
- enumerating `scene.primitives` to find the shapes;
- reading `PolylineDashArrow` material uniforms directly for the line colours;
- for the translucent fills, whose colour lives in GPU vertex attributes and is unreadable from the
  object graph, **rendering each primitive alone against an identical background and solving the
  alpha composite** `over = α·src + (1−α)·under` by linear regression over every covered pixel;
- converting rendered footprints back to ground coordinates via `camera.getPickRay` + `globe.pick`,
  so angles and ranges are in **real metres**;
- reading `Model.modelMatrix` back through an east-north-up frame to recover true world headings.

Page state was changed only in ways that are reversible and non-destructive: `primitive.show` was
toggled and restored, the four display switches were exercised and **returned to off**, and the map
view / virtual-camera attitude was moved. **No waypoint, action or setting was edited, and the route
was never saved.**

---

## 1. There are two cones

Six Cesium primitives form two structurally identical three-part shapes.

| Part | Amber cone | Green cone |
|---|---|---|
| Translucent ground fill | `#FFE100` @ **α ≈ 0.34** | `#00DE93` @ **α ≈ 0.34** |
| Near-opaque outline | `#FFEB00` @ α ≈ 0.92 | `#00F59A` @ α ≈ 0.86 |
| Dashed centre arrow (`PolylineDashArrow`, `dashLength 12`) | **`#FFDB05`** opaque | **`#00D690`** opaque |

The fill figures carry a few units of regression noise. Each fill's hue matches its own dashed
centre line, so the sane reading is a single colour per cone — `#FFDB05` and `#00D690` — drawn at
roughly one-third alpha for the fill and near-full alpha for the outline.

Both cones are present in virtual-flight mode **with all four display toggles off**. They are not
governed by `Display Gimbal Orientation` or by any other switch.

## 2. What each cone is — established by experiment, not inference

Two independent experiments, and they point the same way.

**Experiment A — change the zoom ratio.** Only the green cone responds, and it tracks the ratio
exactly:

| Preview tab reads | Amber area (px) | Green area (px) | Amber ÷ Green |
|---|---|---|---|
| `Zoom 10X [2]` | 56,301 | 5,462 | **10.31** |
| `Zoom 3X [2]` | 55,870 | 18,489 | **3.02** |

The ratio *is* the zoom ratio. Area scaling with `1/zoom` rather than its square also shows the
shape is a **flat ground wedge of roughly fixed range whose width varies** — not a solid volume.

**Experiment B — yaw the virtual aircraft.** Yawing the aircraft to `142.4°` swung the **green cone
round to match**. The **amber cone did not move at all**, staying pointed at ~0° (north). Repeated
at `169.2°` with the same result.

**Conclusion:**

- **Green = the live virtual camera's ground footprint.** It follows the aircraft's yaw and the
  currently selected lens/zoom ratio. This is the shape `feature-reference.md:166` was describing.
- **Amber = a static reference footprint that does not follow the aircraft.** It ignores both the
  aircraft's yaw and the zoom ratio, and stayed at heading 0° — which is also the recorded aircraft
  yaw at both waypoints on this route (both `Aircraft Yaw` actions are `0°`, and both waypoint
  orientation models read heading `0°`).

> **[NOT ESTABLISHED]** Whether the amber cone is anchored to a *specific waypoint* or is a single
> route-level reference. Both cones appeared to share an apex near the waypoint cluster, but the
> apex could not be pinned down: at the zoom levels where the wedge is measurable it overflows the
> viewport, and settling it would have meant flying the virtual aircraft, which was out of scope for
> this session. **Do not guess this in the implementation** — it needs one more targeted look.

## 3. Measured geometry

Ray-picked onto the globe, aircraft at 209 m ASL / 116.3 m ALT, both cones unclipped:

| | Amber | Green (at `Zoom 7X`) |
|---|---|---|
| Full horizontal FOV | **73.19°** | **12.56°** |
| Range from apex | ~235 m | ~182 m |
| Far-edge width | 281.3 m | 39.8 m |

The amber figure agrees to two decimal places between an independent screen-space measurement and
the ground-truth pick, which also confirms the 2D view is effectively top-down.

**The zoom relationship, confirmed:**

```
HFOV_zoom = 2 · atan( tan(HFOV_wide / 2) / zoomRatio )
```

Check at `Zoom 7X`: predicted `2·atan(tan(73.19°/2)/7) = 12.11°` against **12.56° measured** — inside
the noise of a 40 m-wide wedge. `HFOV_wide = 73.2°` for the Matrice 4TD wide camera is consistent
with DJI's published ~84° diagonal FOV for that lens.

## 4. The per-waypoint heading marker — it exists, and it is `Display Gimbal Orientation`

Turning **`Display Gimbal Orientation`** on adds **exactly one primitive per waypoint** (two
waypoints → two primitives). Toggling the switch off removes them; this was confirmed visually at
3 m map scale, not just in the object graph.

Each is a **glTF 3D model**, not a sprite or a polyline:

| Waypoint | Model asset |
|---|---|
| 1 | `wp.glb` |
| 2 | `wp-follow.glb` |
| *(virtual aircraft, always shown)* | `drone.gltf`, rendered `#479EED` |

Rendered appearance at high map zoom: a small **cyan/mint fan- or teardrop-shaped marker** sitting
at the waypoint, distinct from the waypoint's own marker.

**This is the "navigator/heading icon" in the brief.** Its orientation is recovered from the model
matrix as a genuine **world-space heading** — both waypoints on this route read `0°`, matching their
recorded `Aircraft Yaw` of `0°`. Because it is a 3D object placed in the world rather than a
screen-space icon, its *apparent* facing changes as the view camera is rotated while the real-world
direction it indicates stays fixed. That reconciles the description of an icon that "faces the front
direction as the user rotates the camera" — the marker is not tracking the camera, the scene is.

**Two variants exist** — plain `wp` and `wp-follow`. The obvious reading is that `-follow`
corresponds to a waypoint whose heading follows the route rather than being fixed.
**[NOT VERIFIED]** — the two waypoints' heading modes were not compared against which model each
one got, so the mapping is unconfirmed. Worth one check before building it.

## 5. The four display toggles

The panel glyphs, previously recorded only as "a small preview glyph":

| Toggle | Glyph | Effect observed |
|---|---|---|
| `Display Waypoints` | blue shield/marker with a white **S** | Adds the per-waypoint information labels (`ASL`, `HAE`, leg distance, `ALT`). |
| `Display Gimbal Orientation` | **white half-disc / sector** | One `wp.glb` / `wp-follow.glb` orientation model per waypoint — §4. |
| `Display Vertical Lines` | vertical line, dot on top, bar at the base | A **dashed vertical line** at the waypoint linking it to the ground plane. |
| `Bold Line Mode` | thick green line segment | Thickens the route line. **[NOT SEPARATELY VERIFIED]** — this route's legs are only 12.5 m, too short to read the difference reliably at any usable map scale. |

Note the `Display Vertical Lines` finding contradicts our build, which fakes it as a fixed 25 m
dashed stub pointing due **south** (`MapCanvas.jsx:621–641`). The real control draws a true vertical
drop line.

## 6. What was built from this

Implemented 2026-09-03. `frontend/src/lib/camera.js` holds the camera model, `geo.js` gained
`headingAt` and `coverageWedge`, and `MapCanvas.jsx` draws both layers.

| Property | Reference | This build |
|---|---|---|
| Wide fill | `#FFDB05` @ α 0.34 | same |
| Wide centre line | `#FFDB05`, dashed | same, `6 6` |
| Zoom fill | `#00D690` @ α 0.34 | same |
| Zoom centre line | `#00D690`, dashed | same, `6 6` |
| Wide HFOV (M4TD) | 73.19° | same |
| Zoom HFOV | `2·atan(tan(wide/2)/ratio)` | same |
| Orientation marker | `wp.glb` 3D fan per waypoint | flat fan per waypoint, `#40C8E0` |

**Where it deliberately differs, and why:**

1. **Projected from waypoints, not a flying aircraft.** The reference projects from the virtual
   aircraft in a mode this build does not implement. Each waypoint now projects its own pair, using
   `headingAt` and that waypoint's `zoom` action.
2. **The orientation marker is flat, and its colour is approximate.** DJI's asset is a glTF model;
   per the no-third-party-assets rule it is redrawn as a ground fan. Its cyan is read off
   screenshots — the model rendered no isolatable pixels, so it could not be sampled the way the
   wedge colours were.
3. **Range is one observation, not a rule.** `rangeFor` encodes the single measured
   ~235 m-at-116.3 m as a 2× ratio, capped at 1500 m. §7.1 remains open.
4. **Only the M4TD draws coverage.** No other aircraft has a measured field of view, so the toggle
   is shown disabled with the reason rather than inventing one — the same treatment terrain
   following gets.
5. **At 1X the inner wedge is skipped**, since it would be identical to the wide one and would only
   double the fill.

The invented `gimbalYaw` tick this document criticised is gone.

**Also fixed while here:** the display settings menu was `z-50` against Leaflet panes at z-400, so
it had been rendering *underneath the map* since it was added — unreadable and unclickable.

### 6.1 Altitude mode matters more than it looks

A waypoint's altitude number means different things per `heightMode`, and the wedge range is
calibrated against a **ground-relative** figure: the reference aircraft read 209 m ASL but
**116.3 m ALT**, and the ~235 m wedge follows the latter. Feeding `rangeFor` a raw ASL altitude
draws the wedge roughly twice as large — on exactly the route the ratio was measured from.

`groundClearance` resolves this: ALT and AGL are already ground-relative, and ASL is converted by
subtracting the takeoff point's own elevation. That assumes flat ground between takeoff and the
waypoint, which is the assumption the rest of this build already makes, having no elevation service
(feature-reference §12). With no takeoff point there is nothing to subtract and the altitude is
used unchanged — a known imprecision, recorded rather than hidden.

A waypoint at or below the takeoff elevation yields no wedge at all, rather than a negative one.

### 6.2 Where the layers deliberately do not appear

| Context | Coverage | Orientation marker | Why |
|---|---|---|---|
| Editor, 2D | yes | yes | — |
| Editor, tilted (3D) | no | no | The tilted view is served by its own SVG overlay; no Leaflet vector layer renders there. Matches the three pre-existing display toggles. |
| Library preview | no | no | The preview passes no display settings at all, so none of the five toggles apply. |
| Non-M4TD aircraft | no | yes | No measured field of view (§6, point 4). The orientation marker needs no FOV, so it still draws. |
| Mapping routes | as above | yes | A 52-waypoint survey grid draws 52 markers. Cluttered, but it is what one-marker-per-waypoint means; the toggle defaults off. |

### 6.3 Verified

Exercised in the browser against real routes, reading the rendered SVG rather than eyeballing it:

| Case | Result |
|---|---|
| M4TD waypoint route, all at 1X | 5 amber wedges `#FFDB05` at fill-opacity **0.34**, 5 dashed centre lines, 5 cyan fans, **no green** — correct, the inner wedge is skipped at 1X |
| One waypoint set to `Zoom 7X` | exactly **one** green wedge `#00D690` at fill-opacity 0.34 with its own dashed centre line |
| M30T (no measured FOV) | `Display Camera Coverage` **disabled**, 0 amber paths, orientation fans still drawn |
| Area route, 52 waypoints | 52 fans, 85 paths total, no crash or stall |
| Tilted 3D view | 0 Leaflet vector paths, the 3D overlay takes over |
| Library preview | route line and markers only |

Unit coverage: 58 frontend tests, including the altitude-mode conversion, malformed action
parameters, an unset point of interest, and the wide/zoom nesting invariant.

### 6.4 Bugs this testing round found

Worth recording, because three of them would have shipped:

1. **`groundClearance` threw at runtime.** Its `heightAt` import never landed. `npm run build`
   passed regardless — Vite does not resolve undefined identifiers — so only a unit test caught it.
2. **The wedge was ~2× too large on ASL routes**, per §6.1.
3. **`Number(null)` is `0`**, so a null `aircraftHeading` on an Aircraft Yaw action read as a
   confident "due north" instead of as absent. `finiteAngle` now rejects null and empty string.
4. **A route-level manual heading read the waypoint's angle.** A waypoint that had *not* opted into
   overriding could still steer itself with a stale `heading_angle`. The mode and the angle now
   always come from the same place.

## 7. Open questions, listed so they are not quietly guessed

1. What the amber cone is anchored to (§2).
2. Which heading mode selects `wp-follow` over `wp` (§4).
3. Whether the cones can be drawn at all in a Leaflet 2D build, or whether they are inherently tied
   to the virtual-flight mode this build does not implement.
4. `Bold Line Mode`'s exact line weights (§5).
