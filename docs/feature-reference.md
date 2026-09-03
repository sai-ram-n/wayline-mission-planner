# Feature Reference — Wayline Mission Planner

**Source of truth for this build.** Everything below was observed directly in a live DJI
FlightHub 2 Wayline module session on 2026-09-01 (project *DEMO-A Warehouse*), by clicking through
every panel, menu, dropdown and control, and by downloading and inflating a real saved `.kmz` to
read the underlying data model.

This document describes *observed behaviour and data structures*, so that our own application can
replicate the functionality and UX patterns. No DJI branding, iconography, artwork or code is
reproduced, and no DJI product naming is used in our UI beyond aircraft model names needed to
identify supported hardware.

Sections marked **[NOT EXPLORED]** were not reachable in the time available and are explicitly out
of scope — they are recorded so the gap is visible rather than guessed at.

---

## 0. Vocabulary

| Term | Meaning |
|---|---|
| **Flight route** / **wayline** | A saved mission. Our app calls this a *wayline*. |
| **Route type** | The authoring paradigm: waypoint-based, or an area/corridor that generates a route. |
| **Waypoint** | An ordered 3D point the aircraft flies to. |
| **Action** | A task executed at a waypoint (photo, gimbal move, hover…). |
| **Reference takeoff point** | A map location used as the origin/home reference for the mission. |
| **Point S** | The route's start point marker. |

---

## 1. Route types and aircraft compatibility

The Create Route dialog groups seven route types:

| Group | Route types |
|---|---|
| Patrol and Inspection Routes | **Waypoint Route** (default), **Patrol Route** |
| Mapping Routes | **Area Route**, **Linear Route** |
| Detailed Mapping Routes | **Slope Route**, **Geometric Route**, **Smart 3D Capture** |

Selecting a route type **disables incompatible aircraft**. Observed matrix:

| Route type | M30 Series | Mavic 3 Ent. | M3D Series | M4 Ent. | M4D Series | M400 |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Waypoint Route | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Area Route | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Linear Route | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Slope Route | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Geometric Route | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Smart 3D Capture | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Patrol Route | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |

### Aircraft and models

| Aircraft series | Models | Extras |
|---|---|---|
| **Matrice 30 Series** | Matrice 30, **Matrice 30 T** *(pre-selected)* | — |
| Mavic 3 Enterprise Series | Mavic 3E *(default)*, Mavic 3T, Mavic 3TA | — |
| Matrice 3D series | Matrice 3D *(default)*, Matrice 3TD | — |
| Matrice 4 Enterprise Series | Matrice 4E *(default)*, Matrice 4T | Accessories: AS1 Speaker, AL1 SpotLight |
| Matrice 4D Series | Matrice 4D *(default)*, Matrice 4TD | Accessories: AS1 Speaker, AL1 SpotLight |
| Matrice 400 | — | **Payload picker**: 4 bays; choose H30 Series (H30, H30T), P1 (P1‑24mm, P1‑35mm, P1‑50mm), LiDAR (L2, L3), PSDK (V1 Speaker, S1 SpotLight). Bay 1 pre-filled H30. "Click arrow or drag payload to select". |

**Route Name** field defaults to `New <Type> Route(<n>)`, auto-incrementing. Buttons: Cancel / OK.

### Scope for our build
We implement **Waypoint, Area and Linear**. The remaining four appear in our Create dialog but are
visibly marked unsupported.

---

## 2. Flight Route Library

The library is a left panel beside a full-bleed map.

**Panel header actions:** Import/Export (download icon), Delete (trash), and a third
route/branch icon.

**Filters and sorting**
- Model dropdown: *All Models* | Matrice 30 Series | Mavic 3 Enterprise Series | Matrice 3D series | Matrice 4 Enterprise Series | Matrice 4D Series | Matrice 400
- Sort toggle: **New-Old** ⇄ **Old-New**
- Route-type filter icons (8, tooltips confirmed): Waypoint Route, Patrol Route, Mapping, Oblique, Linear Route, Slope Route, Geometric Route, Smart 3D Capture
- Search box: placeholder *"Search folder names or flight route names"* — searches **both** folders and routes

**Folder tree** (left column, header "Folder" + info icon + new-folder button)
- Root is **Default Folder**; folders are **hierarchical**
- New-folder button tooltip: **Create Subfolder**, and **Shift + click → Create Sibling Folder**
- Hovering a folder row reveals a trash icon. Deleting prompts:
  *"All flight routes within this folder and related subfolders will be deleted. Confirm deletion?"* → Cancel / OK

**Route list** (right column, header `Route (N)` + a panel-expand icon + **+ Create Route** button)

Each route card shows: name, aircraft model with a drone glyph, `Updated at YYYY-MM-DD HH:MM:SS`,
a small route-type icon, a pencil (rename) and a `…` overflow menu.

**Card `…` menu:** Rename · Move · Copy · Download · Lock · Delete · **Merge** *(disabled unless
multiple routes are selected)*.

*Lock* corresponds to a read-only state — a locked route cannot be modified.

**Map preview** — selecting a route draws it on the map with numbered waypoint markers and shows a
stats bar with four labelled metrics:

> **Flight Distance** 160.6 m  **Flight Duration** 2 m 48 s  **Waypoints** 12  **Photos** 6

The map also renders project overlays (geo zones, task areas, annotations) and standard map chrome:
search, annotation draw tools (point / line / rectangle / circle), compass with heading, 2D⇄3D
toggle, layer toggles, locate-me, zoom ±, basemap switcher, scale bar, an ASL/HAE readout and a
`WGS 84` datum label.

---

## 3. Mission editor — chrome and layout

**Top bar:** back arrow · **Save** (disk icon; shows "Saving" then a *Saved successfully* toast) ·
**Flight Route Settings** collapsible · centre: route name + aircraft chip · right: notifications,
settings gear, keyboard-shortcuts icon.

**Left panel — Waypoint List**
- Header with an info icon and a **Reverse Flight Route** button (toast: *"Flight route reversed"*)
- Stats strip with the four metrics above
- One row per waypoint: index, a coloured triangular marker, and **one small icon per action**
  attached to that waypoint (rows wrap when there are many). Clicking a row selects the waypoint;
  clicking an action icon selects that action directly.

**Right panel — Action editor** (see §6).

**Settings gear → Flight route display settings** (all toggles, default **off**):
Display Waypoints · Display Gimbal Orientation · Display Vertical Lines · Bold Line Mode.
**Flight Route Edit Settings**: *"Adds support for synchronizing attitude information when adding a
new waypoint"* — **default on**. This is what auto-attaches attitude actions to a new waypoint.

**Low-resolution warning modal:** *"The current web page resolution is too low, adjust the system
display scaling or shrink the web page [Control]+[-] to avoid abnormal display."*

### Keyboard shortcuts (from the in-app Shortcuts panel)

| Key | Action |
|---|---|
| `~` | Switch views |
| `1` / `2` | Wide-angle camera / Zoom camera |
| `W` / `S` | Forward / Backward |
| `A` / `D` | Roll left / Roll right |
| `Q` / `E` | Yaw left / Yaw right |
| `C` / `Z` | Ascend / Descend |
| `X` | Switch speed modes of virtual aircraft |
| `V` | Enable/disable mouselook |
| `F` | Add **Take Photo (Fixed Angle)** at current virtual aircraft location |
| `Shift`+`F` | Insert Take Photo (Fixed Angle) after current waypoint action |
| `Space` | **Add waypoint** at current virtual aircraft location |
| `Shift`+`Space` | Insert waypoint after current waypoint |
| `←` / `→` | Last / Next waypoint action |
| arrows | Last waypoint / Next waypoint |
| `?` | Help |
| `Shift` | Combination key |

---

## 4. Waypoint authoring — "Virtual Flight" mode

Setting a **Reference Takeoff Point** (map hint: *"Click on map to set reference takeoff point"*)
switches the map into a 3D first-person authoring mode. The settings panel then reads
*"Reference takeoff point set"* with a **Reset Takeoff Point** link.

In this mode:
- A green camera-frustum cone projects from the virtual aircraft
- A live camera preview panel shows lens tabs **WIDE 1X [1] / Zoom 5X [2] / IR** and a zoom slider
  (2× · 5× · 10× · 20× · 200× ticks)
- A flight HUD provides Q/W/E and A/S/D pads, an attitude compass, ALT (with paired ASL), distance,
  C (ascend) / Z (descend), and live Longitude / Latitude / SPD readouts
- Two toggles: **Disable mouselook [V]** and **Follow view**

**Important behavioural finding:** clicking the map does **not** add a waypoint in this mode.
Waypoints are created at the virtual aircraft's position via **Add waypoint [Space]**.

**Action strip** ("Based on aircraft location"): Add waypoint `[Space]` · Take Photo (Fixed Angle)
`[F]` · Pano · Record Current Attitude · **More** (full action list).

Adding a waypoint auto-attaches four attitude-capturing actions — **Aircraft Yaw, Gimbal Yaw,
Gimbal Tilt, Camera Zoom** — because *Flight Route Edit Settings → synchronize attitude* is on.
Toast: *"Waypoint added"*.

**Waypoint edit mode:** the selected waypoint's map badge carries a pencil and a trash icon.
The pencil enters an *"Editing waypoint"* state (list shows *"Changing waypoint location"*),
confirmed with `[Space]` ✓ or cancelled with `[Esc]` ✗. While editing, **Longitude, Latitude, SPD
(m/s) and ALT (m)** become editable inputs.

### Our adaptation
Virtual-flight/FPV authoring is out of scope for a browser app with no 3D terrain service. We
implement the equivalent capability with the conventional pattern the fallback spec calls for:
**click the map to add waypoints, drag markers to reposition, drag list rows to reorder** — while
keeping the same waypoint fields, the same auto-attached attitude actions (behind the same
toggle), and the same keyboard shortcuts where they still make sense.

---

## 5. Global settings — "Flight Route Settings" (Waypoint Route)

Observed on a **Matrice 30 T** waypoint route.

| Control | Type | Default | Notes |
|---|---|---|---|
| Reference takeoff point | button / link | not set | sets `takeOffRefPoint`; "Reset Takeoff Point" once set |
| **Camera Settings** | multi-select chips **WIDE / Zoom / IR** | all three on | **M30T-specific** — the three sensors of the M30T payload |
| **Smart Low-Light** | toggle | off | M30T-specific |
| Takeoff behaviour | tabs **Direct Ascent** / **Safe Takeoff** | Direct Ascent | illustrated |
| Safe Takeoff Altitude | number, m | **20** | steppers +100 / +10 / −10 / −100 |
| **Waypoint Altitude Mode** | tabs **ASL** / **ALT** / **AGL** | ASL | with altitude value (e.g. 209 m) and the same steppers |
| Global Flight Speed | number, m/s | **10** | − / + |

### Advanced Settings (collapsed by default)

| Control | Options | Default |
|---|---|---|
| Takeoff Speed | m/s, − / + | **15** (maximum — `+` disabled at 15) |
| **Waypoint Type** | *Coordinated turn. Skips waypoint* · **Straight route. Aircraft stops** · *Turns before waypoint. Flies through* · *Curved route. Aircraft stops* · *Curved route. Aircraft continues* | Straight route. Aircraft stops |
| **Aircraft Yaw** | Along Route · Manual · Lock Yaw Axis | Along Route |
| **Gimbal Control** | Manual · For Each Waypoint | Manual |
| **Upon Completion** | Return to Home · Return to Start Point and Hover · Exit Task · Land | Return to Home |

**Tooltip text captured verbatim** (we reuse the *meaning*, reworded, in our UI):

- *Aircraft Yaw* — **Along Route**: aircraft follows the flight-route direction to the next
  waypoint. **Manual**: allows manual control of aircraft heading while flying to the next
  waypoint. **Lock Yaw Axis**: aircraft keeps its yaw angle from the last waypoint.
- *Gimbal Control* — **Manual**: allows manual gimbal-tilt control in flight; the gimbal keeps its
  angle from the previous waypoint if not adjusted. **For Each Waypoint**: gimbal tilt changes
  evenly as the aircraft flies from one waypoint to the next.
- *Upon Completion* — **Return to Home**: fly to the takeoff point on completion. **Return to
  Start Point and Hover**: fly to Point S and hover. **Exit Task**: exit and hover in place.
  **Land**: land at the current location. In every case the signal-lost action is performed if the
  aircraft is disconnected.

---

## 6. Waypoint actions

Actions belong to a waypoint. The editor panel header shows the action icon, its name, a
`< waypointIndex-actionIndex >` pager, and a trash icon to delete the action.

**Quick actions** (map strip)

| Action | Shortcut | Parameters |
|---|---|---|
| Add waypoint | `Space` | creates a waypoint; auto-attaches the four attitude actions |
| Take Photo (Fixed Angle) | `F` | see table below |
| Pano | — | **none** |
| Record Current Attitude | — | re-captures yaw / gimbal / zoom into actions at the selected waypoint |

**Full action list** (the "More" fly-out — 12 entries):
Start Recording · Stop Recording · Start Timed Interval Shot · Start Distance Interval Shot ·
End Interval Shot · Hover · Aircraft Yaw · Gimbal Yaw · Gimbal Tilt · Take Photo · Camera Zoom ·
Create Folder.

### Verified parameter editors

| Action | Editor |
|---|---|
| **Aircraft Yaw** | slider + numeric, degrees, default **0°**, − / + |
| **Gimbal Yaw** | slider + numeric, degrees, default **0°**, − / + |
| **Gimbal Tilt** | slider + numeric, degrees, default **0°**, − / + |
| **Camera Zoom** | *Zoom Ratio* slider + numeric, default **5 X**, − / + |
| **Hover** | *Hover Duration*, seconds, default **10 s**, steppers −100 −10 −1 / +1 +10 +100 |
| **Start Recording** | file-name template `DJI_YYYYMMDDhhmm_XXX_` with a pencil that opens an inline text input (✓ / ✗) for a custom suffix; lens chips **WIDE / ZOOM / IR**; **Follow Route** toggle |
| **Stop Recording** | **none** |
| **Take Photo** | as Start Recording: file-name template + pencil, lens chips, Follow Route toggle |
| **Take Photo (Fixed Angle)** | file-name template `DJI_YYYYMMDDhhmmss_XXXX_` + pencil, lens chips, Follow Route toggle, plus a **Snapshot Preview** — a rendered reference framing from the 3D scene with a lens badge (e.g. "Zoom 5X"), a framing rectangle and a capture timestamp — and an **AI Spot-Check** button (disabled in this project) |
| **Start Timed Interval Shot** | *Time Interval*, seconds, default **3 s**, steppers −100 −10 −1 / +1 +10 +100; lens chips; Follow Route toggle |
| **End Interval Shot** | **none** |
| **Create Folder** | *New Folder Name* = `DJI_YYYYMMDDhhmm_XXX_` + pencil to edit |
| **Pano** | **none** |
| **Start Distance Interval Shot** | Present in the menu but it would **not attach** to a Matrice 30T waypoint route across repeated attempts, with and without an interval already running — apparently unsupported for this aircraft/route-type combination. The equivalent capability exists as *Photo Mode → Distance Interval Shot* on mapping routes (§8). By symmetry with the timed variant it takes a distance interval in metres. |

### Behavioural rules (verified, not assumed)

1. **Take Photo is blocked while the camera is recording.** With a `Start Recording` action earlier
   in the route, the Take Photo entry silently refuses to attach; after adding `Stop Recording` it
   attaches normally. The interval-shot actions are governed by the same kind of state machine.
2. **Follow Route ON (blue)** disables/dims the WIDE / ZOOM / IR chips — the action inherits the
   route-level Camera Settings. Turning it **off** enables per-action lens selection.
3. The **Photos** stat recomputes live from interval actions — a 3 s timed interval over the
   remaining route showed `25`; adding *End Interval Shot* dropped it to `4`.
4. The **Flight Duration** stat grows as Hover actions are added (observed 1 m 40 s → 1 m 52 s →
   2 m 48 s).

---

## 7. Underlying data model — DJI WPML (KMZ)

A flight route is stored as a **`.kmz`** (a zip) containing `wpmz/template.kml` and
`wpmz/waylines.wpml`, XML namespace `http://www.dji.com/wpmz/1.0.6`.

Retrieved via `GET /wayline/api/v1/workspaces/{projectId}/waylines/{waylineId}`, which returns a
signed CDN URL to the KMZ. **This is our export/import format.**

### `Document` → `wpml:missionConfig`

| Element | Example | Maps to |
|---|---|---|
| `author`, `createTime`, `updateTime` | epoch ms | metadata |
| `flyToWaylineMode` | `safely` | Direct Ascent / Safe Takeoff |
| `finishAction` | `goHome` | Upon Completion |
| `exitOnRCLost` | `goContinue` | — |
| `executeRCLostAction` | `goBack` | — |
| `takeOffSecurityHeight` | `20` | Safe Takeoff Altitude (m) |
| `takeOffRefPoint` | `lat,lng,alt` | Reference Takeoff Point |
| `takeOffRefPointAGLHeight` | `0` | — |
| `globalTransitionalSpeed` | `15` | Takeoff Speed (m/s) |
| `globalRTHHeight` | `100` | RTH altitude (m) |
| `droneInfo` | `droneEnumValue 67`, `droneSubEnumValue 1` | **67 = Matrice 30 series, sub 1 = M30T** |
| `waylineAvoidLimitAreaMode` | `0` | — |
| `payloadInfo` | `payloadEnumValue 53`, `payloadSubEnumValue 2`, `payloadPositionIndex 0` | M30T payload |

### `Folder` (the template / wayline itself)

| Element | Example | Maps to |
|---|---|---|
| `templateType` | `waypoint` | route type (`mapping2d`, `mappingStrip`, … for others) |
| `templateId` | `0` | — |
| `waylineCoordinateSysParam` | `coordinateMode WGS84`, `heightMode EGM96` | altitude mode (EGM96 ⇒ ASL) |
| `autoFlightSpeed` | `10` | Global Flight Speed |
| `globalHeight` | `209` | Waypoint Altitude |
| `caliFlightEnable` | `0` | — |
| `gimbalPitchMode` | `manual` | Gimbal Control (`manual` / `usePointSetting`) |
| `globalWaypointHeadingParam` | `waypointHeadingMode followWayline`, `waypointHeadingAngle`, `waypointPoiPoint`, `waypointHeadingPathMode followBadArc`, `waypointHeadingPoiIndex` | Aircraft Yaw |
| `globalWaypointTurnMode` | `toPointAndStopWithDiscontinuityCurvature` | Waypoint Type |
| `globalUseStraightLine` | `1` | — |
| `payloadParam` | `focusMode firstPoint`, `meteringMode average`, `returnMode singleReturnStrongest`, `samplingRate 240000`, `scanningMode repetitive`, **`imageFormat "wide,zoom,ir"`**, `photoSize default_l` | `imageFormat` ⇔ the **Camera Settings** chips |

### `Placemark` = one waypoint

```
Point/coordinates          "lng,lat"
wpml:index                 0-based order
wpml:ellipsoidHeight       216.798477959805      (HAE)
wpml:height                211.498655338         (per the selected altitude mode)
wpml:waypointSpeed         10
wpml:waypointHeadingParam  { waypointHeadingMode, waypointHeadingAngle, waypointPoiPoint,
                             waypointHeadingPathMode, waypointHeadingPoiIndex }
wpml:waypointTurnParam     { waypointTurnMode, waypointTurnDampingDist = 0.2 }
wpml:useGlobalSpeed        1     <- per-waypoint override flags
wpml:useGlobalHeadingParam 1
wpml:useGlobalTurnParam    1
wpml:useStraightLine       1
wpml:actionGroup           { actionGroupId, actionGroupStartIndex, actionGroupEndIndex,
                             actionGroupMode = sequence,
                             actionTrigger { actionTriggerType = reachPoint },
                             action* { actionId, actionActuatorFunc, actionActuatorFuncParam{…} } }
```

### Action parameters in WPML

| `actionActuatorFunc` | Parameters |
|---|---|
| `rotateYaw` | `aircraftHeading`, `aircraftPathMode` (`counterClockwise` \| `clockwise`) |
| `gimbalRotate` | `gimbalHeadingYawBase` (`north`), `gimbalRotateMode` (`absoluteAngle`), `gimbalPitchRotateEnable`/`Angle`, `gimbalRollRotateEnable`/`Angle`, `gimbalYawRotateEnable`/`Angle`, `gimbalRotateTimeEnable`/`Time`, `payloadPositionIndex` — **Gimbal Yaw** sets `gimbalYawRotateEnable=1`; **Gimbal Tilt** sets `gimbalPitchRotateEnable=1` |
| `zoom` | `focalLength` (e.g. `120.3`), `isUseFocalFactor=0`, `payloadPositionIndex`, `isRisky=0` |
| `takePhoto`, `startRecord`, `stopRecord`, `hover`, `startTimeShoot`, `stopShoot`, `panoShot`, `customDirName` | mapped from the UI editors in §6 |

**Waypoint Type ⇄ `globalWaypointTurnMode`**

| UI label | WPML enum |
|---|---|
| Coordinated turn. Skips waypoint | `coordinateTurn` |
| **Straight route. Aircraft stops** *(default)* | `toPointAndStopWithDiscontinuityCurvature` |
| Curved route. Aircraft stops | `toPointAndStopWithContinuityCurvature` |
| Turns before waypoint. Flies through / Curved route. Aircraft continues | `toPointAndPassWithContinuityCurvature` |

> The five UI labels are verbatim from the dropdown. The enum names are the documented DJI WPML
> set; only `toPointAndStopWithDiscontinuityCurvature` was observed directly in an exported file
> (it is the default). Our importer therefore accepts any of these and our exporter writes the
> mapping above.

---

## 8. Mapping routes

### 8.1 Area Route (verified on Matrice 30 T)

Header stats (**4**): Area (m²) · Flight Distance (m) · Duration · Photos.
A drawn 183.7 m × 153.1 m rectangle produced **28,111.66 m², 522.9 m, 1 m 2 s, 32 photos**.

| Control | Default | Notes |
|---|---|---|
| Reference takeoff point | not set | as §5 |
| **Select Lens** | **WIDE** / IR | M30T mapping offers only Wide and IR — **no Zoom** |
| **Photo Collection** | **Ortho Collection** / Oblique Collection | |
| **GSD** | **5 cm/pixel** | steppers −1 −0.1 / +0.1 +1 |
| Waypoint Altitude Mode | ASL / ALT / **AGL** | AGL is the default here (unlike waypoint routes) |
| Terrain Follow File Management | *Global Elevation Data* | warning: *"Global elevation data is for reference only. Fly with caution"* |
| Safe Takeoff Altitude | **20 m** | |
| Global Flight Speed | **15 m/s** | |
| Course Angle | **0°** | slider |
| Elevation Optimization | **on** | |
| Upon Completion | Return to Home | |

**Advanced Settings:** Takeoff Speed **15 m/s** · **Side Overlap Rate 70 %** · **Forward Overlap
Rate 80 %** · Margin **0 m** · **Photo Mode**: *Timed Interval Shot* | *Distance Interval Shot* ·
Custom Camera Angle (toggle, off) · Route Start Point ("Set route start point").

**Drawing:** map hint *"Click on map to draw a mapping area"*; click each vertex and
**double-click to close**. `Esc` while drawing cancels; `Esc` after closing exits editing. The
polygon shows vertex handles, edge-midpoint handles and edge length labels. A *"Generating flight
route"* indicator appears, then a green boustrophedon path with an **S** start marker is drawn
inside the blue area boundary.

### 8.2 Linear Route (verified on Mavic 3T)

Header stats (**5**): Centre-line length · Area (m²) · Flight Distance · Duration · Photos.
A 3-point centre line produced **262.9 m, 26,235.43 m², 762.2 m, 1 m 30 s, 48 photos**.

| Control | Default | Notes |
|---|---|---|
| **Select Lens** | **Visible** / **IR** | Mavic 3T naming differs from M30T's WIDE/Zoom/IR |
| Mode tabs | **Zigzag Route** / Single Route | |
| Left Extension Length | **50 m** | a chain/link icon couples left and right |
| Right Extension Length | **50 m** | |
| Cutting Distance | **1000 m** | |
| Merge Mapping Area | link | |
| Flip Mapping Area | button | |
| GSD(Visible) | **5 cm/pixel** | a linked GSD(IR) below |
| Real-Time Terrain Follow | toggle, off | |
| Terrain Follow File Management | Global Elevation Data | same warning |
| Safe Takeoff Altitude | **20 m** | |
| Global Flight Speed | **10 m/s** | |
| **Flight Route Direction** | *Parallel to Center Line* | dropdown |
| Elevation Optimization | **on** | |
| Boundary Optimization | off | |
| Upon Completion | Return to Home | |

**Advanced Settings:** Takeoff Speed **15 m/s** · Side Overlap **70 %** · Forward Overlap **80 %** ·
Photo Mode (Timed / Distance Interval Shot) · **Include Center Line** (toggle, off).

**Drawing:** hint *"Click on map to draw flight band"*; click centre-line vertices, double-click to
finish. The app buffers the line by the left/right extensions into a corridor and generates a
boustrophedon route inside it.

### 8.3 Patrol Route (verified on Matrice 4T) — documented, not implemented

Included because it was fully explored, even though it is out of build scope.

Header stats (4): Area · Distance · Duration · detection-subject indicator.

**Smart Capture Alerts** (toggle, **on**):
- **Smart Detection Type**: *Visible Light* (dropdown)
- **Warning Threshold**: rows for **People** (enabled, `≥ 1`), **Vehicles**, **Boats** — each with a
  comparator dropdown and a count
- **Confidence Level**: **55 %** slider, labelled *Complete* ↔ *Accurate*
- **Alert Interval**: **2 s**, steppers −10 −5 −1 / +1 +5 +10
- **Camera for Recognition**: **Wide Angle** | 3× Visible | 7× Visible
- **Photo Storage Settings**: ☑ Visible ☐ IR

Then: Safe Takeoff Altitude 20 m · Global Flight Speed 10 m/s · Course Angle 0° ·
**Gimbal Tilt Angle −45°** · Upon Completion.
**Advanced:** Takeoff Speed 15 m/s · Side Overlap Rate **20 %** · Route Start Point ·
Custom GEO Zone Obstacle Bypassing (toggle) · Bypass Obstacle (toggle).

A tooltip on Gimbal Tilt Angle: *"When different detection subjects are selected for Smart Capture
alerts, different default angles will be recommended to improve detection accuracy"* —
People / Vehicles / Boats all recommend **−60 … −30°**, default **−45°**.

---

## 9. Matrice 30T specifics (explicitly required)

Consolidated, since the brief calls this model out:

- Sits under **Matrice 30 Series**, alongside Matrice 30; **M30T is the pre-selected model**.
- WPML identity: `droneEnumValue 67`, `droneSubEnumValue 1`; payload
  `payloadEnumValue 53`, `payloadSubEnumValue 2`, `payloadPositionIndex 0`.
- **Three sensors** — the waypoint-route Camera Settings chips are **WIDE / Zoom / IR**, all on by
  default, serialised as `imageFormat="wide,zoom,ir"`.
- Exposes a **Smart Low-Light** toggle (off by default) that other series did not show.
- The virtual-flight camera preview offers **WIDE 1X [1] / Zoom 5X [2] / IR** tabs with a zoom
  slider up to 200×; the default Camera Zoom action value is **5 X** (`focalLength 120.3`).
- On **Area Routes** the M30T lens choice narrows to **WIDE / IR only** — no Zoom.
- **No accessories** section (unlike M4E/M4D, which offer AS1 Speaker / AL1 SpotLight).
- Supports Waypoint and Area routes; **not** Linear, Slope, Geometric, Smart 3D Capture or Patrol.
- Other observed defaults on an M30T waypoint route: Global Flight Speed 10 m/s, Takeoff Speed
  15 m/s (max), Safe Takeoff Altitude 20 m, RTH height 100 m, altitude mode ASL.

---

## 9b. Matrice 4TD specifics (explored 2026-09-03)

Observed by creating `WMP-F-M4TD-2D-Explore`, a Waypoint Route on **Matrice 4D Series →
Matrice 4TD**, and working through it in the 2D top-down view. Differences from the M30T are the
point of this section; everything not listed matched §5–§6.

**Create Route dialog**
- Matrice 4D Series offers models **Matrice 4D** *(default)* and **Matrice 4TD**, plus an
  **Accessories** row: AS1 Speaker, AL1 SpotLight.

**Flight Route Settings**
- **Camera Settings: `Visible` / `IR`** — two sensors, no Zoom (M30T has WIDE/Zoom/IR).
- **Smart Low-Light** toggle is present, off by default. It is *not* M30T-only.
- Defaults matched the M30T: Direct Ascent, Safe Takeoff Altitude 20 m, Waypoint Altitude Mode
  ASL 209 m, Global Flight Speed 10 m/s, Takeoff Speed 15 m/s, Waypoint Type *Straight route.
  Aircraft stops*, Aircraft Yaw *Along Route*, Gimbal Control *Manual*, Upon Completion
  *Return to Home*.
- **Advanced Settings adds `Bypass Obstacle`** (toggle, off) as the last row. The M30T panel has
  no such control.

**Virtual-flight action strip** — as §6, plus a sixth entry: **Smart Capture (BETA)**.

**Camera preview** — lens tabs read **WIDE 1X [1] / Zoom 7X [2]** with an IR badge. The M30T reads
Zoom **5X**.

**Auto-attached attitude actions: three, not four.** Adding a waypoint attaches
`1-1 Aircraft Yaw`, `1-2 Gimbal Tilt`, `1-3 Camera Zoom`. There is **no Gimbal Yaw**, and the
default **Zoom Ratio is 1 X** (M30T defaults to 5 X).

**"More" fly-out: 11 entries, not 12.** Start Recording · Stop Recording · Start Timed Interval
Shot · Start Distance Interval Shot · End Interval Shot · Hover · Aircraft Yaw · Gimbal Tilt ·
Take Photo · Camera Zoom · Create Folder. **Gimbal Yaw is absent** for this aircraft.

**Start Distance Interval Shot attaches normally here.** It refused to attach on an M30T waypoint
route (§6), so that restriction is aircraft-specific, not universal. Its editor is *Distance*
**10 m** with steppers −100 −10 −1 / +1 +10 +100, the Visible/IR lens chips, and a **Follow Route**
toggle (on by default, dimming the chips as in §6 rule 2).

**Take Photo would not attach**, across three attempts on the same waypoint, including after
`End Interval Shot` had been added so nothing was recording and no interval was running. The
pager never advanced past the existing action. Cause not established — recorded as observed, in
the same spirit as the Start Distance Interval Shot finding in §6.

---

## 10. [NOT EXPLORED] — deliberate gaps

These were not opened during the exploration session and are **not** described from assumption:

1. **Drone / fleet page** — the fleet icon in the project rail was never opened. Device list,
   status semantics, binding and dock/aircraft distinctions are unknown.
2. **Task / scheduling module** — FlightHub's actual mechanism for dispatching a wayline to an
   aircraft (task creation, device selection, scheduling, execution monitoring) was never opened.
3. **Slope Route, Geometric Route, Smart 3D Capture** settings panels.
4. **Route card actions in depth** — Move, Copy, Download, Lock and Merge were seen in the menu but
   their dialogs/behaviour were not exercised.
5. **Import flow** — the library's import/export header control was not exercised.
6. **Per-waypoint override UI** — `useGlobalSpeed`, `useGlobalHeadingParam`, `useGlobalTurnParam`
   and `useStraightLine` exist per-waypoint in the WPML, but the UI control that toggles them was
   not located.

**Consequence for this build:** our **Drone Fleet and Assignment** feature (§11) follows the
project brief's fallback specification rather than mirroring FlightHub, and is presented as our own
design. Per-waypoint overrides are implemented from the data model with our own UI affordance.

---

## 11. Our application — feature set to build

Derived from the above plus the project brief's fallback spec.

### 11.1 Mission editor
- Leaflet map on OpenStreetMap tiles; click to append waypoints; drag markers to reposition;
  drag list rows to reorder; numbered markers joined by a polyline
- Waypoint list mirroring the observed layout: index, marker, one icon per attached action
- Live stats bar: **Flight Distance · Flight Duration · Waypoints · Photos** (Turf.js)
- Reverse route; delete waypoint; undo last; clear mission
- Reference takeoff point; Point S start marker
- Editor display settings (Display Waypoints / Gimbal Orientation / Vertical Lines / Bold Line) and
  the "synchronize attitude on new waypoint" toggle
- Save as a named wayline with a description

### 11.2 Waypoint settings
Altitude (+ altitude mode ASL/ALT/AGL), speed, heading mode (Along Route / Manual / Lock Yaw Axis /
Point of Interest), heading angle, POI coordinates, turn mode (the five Waypoint Types), turn
damping distance, and the four per-waypoint *use global* override toggles.

### 11.3 Actions
The full verified set with the parameter editors from §6, the `< n-m >` pager, per-action delete,
the **Take Photo blocked while recording** rule and the **Follow Route** lens-chip behaviour.

### 11.4 Global settings
Every control in §5, with the real defaults and enums, plus reworded tooltip guidance.

### 11.5 Mapping routes
Area and Linear: polygon / centre-line drawing with double-click-to-close, their settings panels
from §8, and boustrophedon generation with live regeneration when settings change.

### 11.6 Library
Grid/list of waylines with name, description, aircraft model, waypoint count, last-updated and an
auto-generated SVG polyline preview thumbnail. Search by name, filter by model and route type,
sort New-Old / Old-New, hierarchical folders. Per-card: load into editor, Rename, Duplicate,
Lock, Delete, Download `.kmz`. Create Route dialog enforcing the §1 compatibility matrix.

### 11.7 Drone fleet and assignment *(our own design — see §10)*
Mock fleet (id, name, model, series, status `idle | flying | offline`) seeded with several aircraft
including a Matrice 30T. Assign a saved wayline to one or more drones, creating assignment records.
Assignment table showing wayline → drone → status, with manual advance simulating progress:
`pending → synced → in_progress → complete`, plus `failed`.

### 11.8 KMZ interchange
Export any wayline as a real `.kmz` (`wpmz/template.kml` + `wpmz/waylines.wpml`, namespace 1.0.6)
using the §7 schema, and import a `.kmz` back into a wayline.

---

## 12. Build status against this document

Added 2026-09-02 after auditing the shipped code against §11.

**Built.** §11.1 in full (including the four display settings and the keyboard shortcuts that
survive the click-to-add adaptation), §11.2 in full (including editable coordinates and all four
override toggles), §11.3, §11.4, §11.5 (bar the two items below), §11.6, §11.7, §11.8.

**Deliberately not built, with the reason:**

| Item | Why |
|---|---|
| Virtual-flight / FPV authoring (§4) and the Snapshot Preview + AI Spot-Check (§6) | Need a 3D terrain and scene service this build has no access to. Replaced by click-to-add authoring, as §4 already records. |
| Patrol, Slope, Geometric, Smart 3D Capture (§1) | Out of scope by agreement; visibly marked unsupported in the Create Route dialog. Only Patrol was ever explored (§8.3). |
| **Merge Mapping Area** (§8.2) and the library's **Merge** action (§2) | §10.4 records that these dialogs were never exercised. Their behaviour is unknown, so building them would mean inventing semantics rather than replicating them. |
| Real-time terrain following (§8.1, §8.2) | No elevation service. The control is shown disabled with an explanation rather than faked. |
| The fifth *Waypoint Type* label as a separate entry | Two UI labels share one WPML enum (§7). Both wordings are kept in a single combined label rather than presenting a choice that cannot be serialised. |

**Added since:** the **2D / 3D toggle** (§2 map chrome) now exists, as a tilted view of the flat
map rather than a 3D globe — see `docs/progress-log.md` for the design and its limits. Terrain is
still absent, so the ground plane is flat.

**Deviation:** *Display Waypoints* defaults **on**, unlike the reference where all four display
toggles default off. Waypoint markers are how a waypoint is selected and dragged here, so starting
with them hidden would make the editor unusable.

---

*Compiled 2026-09-01 from direct exploration of the live Wayline module. Behaviour marked
"verified" was observed; anything uncertain is flagged inline or listed in §10.*
