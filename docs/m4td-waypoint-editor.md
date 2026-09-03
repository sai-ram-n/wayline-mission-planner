# Waypoint Route Editor — Matrice 4TD

**Explored 2026-09-03** on the live FlightHub 2 wayline module, project *DEMO-A Warehouse*, by
creating the route `WMP-F-M4TD-2D-Explore` (Waypoint Route · Matrice 4D Series · **Matrice 4TD**)
and working through every panel, control and shortcut in the **2D** view.

Companion to `feature-reference.md`. That document is M30T-centric; this one records the editor as
it behaves for the M4TD, in enough detail to build against. Aircraft-level differences already
summarised in feature-reference **§9b** are repeated here in context.

> **On assets.** Layout, spacing, colour values, control types and interaction behaviour are
> recorded and reproduced. Icon and image *files* are not copied — this build uses its own icon set
> chosen to match each control's shape and meaning, per the project's no-third-party-assets rule.

---

## 1. Screen layout

Four regions, all over a full-bleed satellite map:

| Region | Contents |
|---|---|
| **Top bar** | back arrow · save (disk) · **Flight Route Settings** disclosure · centre: route name + aircraft chip · right: notifications, editor settings (gear), keyboard shortcuts |
| **Left panel** | Waypoint List — header, stats strip, one row per waypoint |
| **Right panel** | Action editor for the selected action |
| **Map** | virtual-flight HUD, action strip, map control rail, camera preview (bottom right) |

## 2. Top bar

- **Back arrow** — leaves the editor.
- **Save (disk icon)** — tooltip `Save`; shows a green-tick toast **"Saved successfully"**.
- **Flight Route Settings** — a toggle button that opens/closes the settings panel over the left
  side. Chevron flips ▲/▼.
- **Centre**: route name, then an aircraft chip with a drone glyph — `Matrice 4TD`.
- **Right**: bell (notifications), gear (editor display settings), keyboard (shortcuts).

## 3. Flight Route Settings panel

Scrollable, in this order.

| Control | Type | Default (M4TD) |
|---|---|---|
| Reference takeoff point | full-width blue button, `Reference takeoff point not set` | not set |
| **Camera Settings** | chips **Visible / IR** — two only, no Zoom | both on |
| **Smart Low-Light** | toggle | off |
| Takeoff behaviour | tabs **Direct Ascent** / Safe Takeoff, with an explanatory diagram | Direct Ascent |
| Safe Takeoff Altitude | number + stepper column `+100 / +10 / −10 / −100` | **20 m** |
| **Waypoint Altitude Mode** | tabs **ASL** / ALT / AGL, with a sea-level diagram | ASL |
| Altitude | number + same stepper column | **209 m** |
| Global Flight Speed | number, − / + | **10 m/s** |
| **Advanced Settings** | collapsible | collapsed |

### Advanced Settings

| Control | Type | Default |
|---|---|---|
| Takeoff Speed | − / + | **15 m/s** (`+` disabled at 15) |
| Waypoint Type | dropdown | Straight route. Aircraft stops |
| Aircraft Yaw ⓘ | dropdown | Along Route |
| Gimbal Control ⓘ | dropdown | Manual |
| Upon Completion ⓘ | dropdown | Return to Home |
| **Bypass Obstacle** ⓘ | **toggle** | **off** |

`Bypass Obstacle` is the last row and does **not** appear on the M30T.

## 4. Editor settings (gear)

Two grouped sections in a floating panel:

**Flight route display settings** — four toggles, each with a small preview glyph, all **off**:
`Display Waypoints` · `Display Gimbal Orientation` · `Display Vertical Lines` · `Bold Line Mode`.

**Flight Route Edit Settings**
- Toggle, **on**: *"Adds support for synchronizing attitude information when adding a new
  waypoint"* — this is what auto-attaches the attitude actions.
- **`Min Flight Route Altitude Alert (AGL)`** — numeric input with unit `m`, default **20.0**.
  Not previously recorded.

## 5. Waypoint List (left panel)

**Header** — `Waypoint List` + ⓘ, and a right-aligned **Reverse Flight Route** button.

**Stats strip** — four columns, icon above value:

| Icon | Value in the session |
|---|---|
| route/distance | `12.5 m` |
| clock | `6 s` |
| waypoint triangle | `2` |
| photo | `1` |

**Rows** — one per waypoint:
- A **green downward triangle ▼** followed by the index. Not a numbered circle.
- Then **one small icon per attached action**, in order. Clicking an action icon selects that
  action directly and highlights it with a **blue filled square**.
- The selected waypoint's row gets a lighter background.
- While editing a waypoint's location the whole row turns **orange** and gains the sub-label
  *"Changing waypoint location"*.

## 6. Map — virtual-flight HUD and action strip

Setting the reference takeoff point switches the map into virtual-flight authoring. The map hint
before that reads *"Click on map to set reference takeoff point"*.

**Action strip** (label: *"Based on aircraft location"*), six entries:

| Entry | Shortcut |
|---|---|
| Add waypoint | `[Space]` |
| Take Photo (Fixed Angle) | `[F]` |
| Pano | — |
| Record Current Attitude | — |
| More | — |
| **Smart Capture (BETA)** | — |

`Smart Capture (BETA)` is M4-series only; it is absent on the M30T.

**HUD** — `Q W E` / `A S D` key pads, a heading compass reading `000°`, an `ALT` readout with a
paired `ASL` value, a distance readout, `C` (ascend) / `Z` (descend), and live
`Longitude` / `Latitude` / `SPD m/s` fields. Label **"Virtual flight"** sits to the left.

**Bottom-left map toggles** — `Disable mouselook [V]` and `Follow view`.

**Camera preview (bottom right)** — lens tabs **`WIDE 1X [1]`** / **`Zoom 7X [2]`** plus an `IR`
badge, and a vertical zoom-ratio scale (`2X … 112X`). The zoom tab label tracks the current ratio
(it read `Zoom 10X [2]` after zooming). The M30T reads `Zoom 5X`.

**Map control rail (right)** — search, annotation draw tools (point / line / rectangle / circle),
compass, **`3D` / `2D` toggle**, info, layers, locate-me, `+` / `−`, basemap thumbnail. Bottom
status bar: scale bar, `ASL:`, `HAE:`, `WGS 84`.

## 7. Waypoint editing

Selecting a waypoint puts a **pencil** and **trash** on its map badge.

The pencil enters **"Editing waypoint"**: an orange banner across the map reads `Editing waypoint`
with a **✓ `[Space]`** and **✗ `[Esc]`**. While in this mode the HUD fields become editable:

- `Longitude` — e.g. `145.2798431`
- `Latitude` — e.g. `-37.8078103`
- `SPD m/s` — e.g. `10.0`
- `ALT` / `ASL` — e.g. `116.3` / `209`

This is the per-waypoint override UI that `feature-reference.md` §10.6 recorded as *not located*.

## 8. Actions

### Auto-attached on Add waypoint — **three**, not four

`1-1 Aircraft Yaw` · `1-2 Gimbal Tilt` · `1-3 Camera Zoom`. **No Gimbal Yaw.**
Camera Zoom defaults to **1 X** (the M30T defaults to 5 X).

### "More" fly-out — **11 entries**, not 12

Start Recording · Stop Recording · Start Timed Interval Shot · Start Distance Interval Shot ·
End Interval Shot · Hover · Aircraft Yaw · **Gimbal Tilt** · Take Photo · Camera Zoom ·
Create Folder.

**Gimbal Yaw is absent entirely for this aircraft.**

### Action editor panel

Header: action icon · action name · `‹ waypoint-action ›` pager · trash. Then the parameters.

| Action | Editor |
|---|---|
| Aircraft Yaw | slider + numeric, `0 °`, − / + |
| Gimbal Tilt | slider + numeric, `0 °`, − / + |
| Camera Zoom | *Zoom Ratio* slider + numeric, **`1 X`** |
| Hover | *Hover Duration*, seconds |
| **Start Distance Interval Shot** | *Distance* **`10 m`**, steppers `−100 −10 −1 / +1 +10 +100`, lens chips `VISIBLE` `IR`, **Follow Route** toggle (on) |
| End Interval Shot | no parameters |
| Stop Recording · Pano | no parameters |

**Follow Route on (blue)** dims the lens chips — same rule as the M30T.

### Behaviour observed

1. **Start Distance Interval Shot attaches normally on the M4TD.** It would not attach on an M30T
   waypoint route, so that restriction is aircraft-specific.
2. **Take Photo would not attach while a distance interval shot was running.** Previously only
   recording was known to block it.
3. **Take Photo would not attach at all** on this M4TD waypoint — three attempts, including after
   `End Interval Shot` so nothing was recording and no interval was running. The pager never
   advanced. **Cause not established.** Recorded as observed; no rule inferred from it.

## 9. Keyboard shortcuts

From the in-app Shortcuts panel, rendered as a keyboard diagram.

| Key | Action |
|---|---|
| `~` | Switch views |
| `1` / `2` | Wide-angle camera / Zoom camera |
| `Q` / `E` | Yaw left / Yaw right |
| `W` / `S` | Forward / Backward |
| `A` / `D` | Roll left / Roll right |
| `C` / `Z` | Ascend / Descend |
| `X` | Switch speed modes of virtual aircraft |
| `V` | Enable/disable mouselook |
| `F` | Add Take Photo (Fixed Angle) at the aircraft's location |
| `Shift`+`F` | Insert Take Photo (Fixed Angle) **after the current waypoint action** |
| `Space` | Add waypoint at the aircraft's location |
| `Shift`+`Space` | Insert waypoint **after the current waypoint** |
| `←` / `→` | Last waypoint action / Next point |
| `↑` / `↓` | Last waypoint / Next waypoint |
| `Shift` | Combination key |
| `?` | Help |

Footer: *"Click **User Manual** for more details and click **Contact DJI Support** to submit
questions"*.

## 10. Visual style, as measured

Sampled from computed styles on the live page.

| Token | Value |
|---|---|
| Panel background | `#232323` |
| Raised surface / control | `#3c3c3c` |
| Deepest background | `#101010` |
| Floating panel | `rgba(38,38,38,.95)` |
| Accent (primary, selected) | `#2d8cf0` |
| Success / start marker | `#00ee8b` |
| Text primary | `#ffffff` |
| Text secondary | `#bfbfbf` |
| Text disabled | `#595959` |
| Border radius | `2px`, `4px`, `8px` |
| Font | system UI stack |

The chrome is **neutral grey**, not blue-tinted, and the start/active green is a bright mint.

## 11. What this build implements

Applied from this document:

- Neutral-grey palette, accent `#2d8cf0`, mint `#00ee8b`, 2/4/8 px radii.
- Green ▼ triangle waypoint markers in the list and on the map, with the selected row highlighted.
- Map badge pencil/trash on the selected waypoint, and an **Editing waypoint** mode with an orange
  banner, ✓/✗ confirm and cancel, and editable coordinates, speed and altitude.
- `Min Flight Route Altitude Alert (AGL)` in editor settings, default 20 m.
- `Bypass Obstacle` in Advanced Settings for M4-series aircraft.
- `Shift`+`Space` insert-waypoint-after and `Shift`+`F` insert-action-after.
- The four display toggles and the synchronize-attitude toggle grouped as two sections.

**Aircraft identity through KMZ.** Only the M30 series' `droneEnumValue` was ever observed in a
real export, so an M4TD would otherwise export with a zero identifier and re-import as the wrong
aircraft. Rather than invent DJI's values, an export carries an extra
`wpmz/wayline-mission-planner.json` entry beside the two spec files; the WPML itself stays exactly
as observed. Our exports round-trip as themselves, and a file from another tool falls back to the
WPML identifiers, reporting honestly when the aircraft cannot be determined.

**Not implemented, and why:** virtual-flight/FPV authoring and `Smart Capture (BETA)` need a 3D
scene and detection service this build has no access to; the Take Photo refusal in §8.3 has no
established cause, so no rule was invented for it.

---

## 12. Correction — map camera visuals (added 2026-09-03)

This document was written from a **2D-only** session and did not describe the coloured shapes on the
map at all. A follow-up session measured them; the results are in
`docs/waypoint-camera-visuals.md`. Three corrections land here:

1. **`Display Gimbal Orientation` draws a per-waypoint 3D orientation marker** — one glTF model per
   waypoint (`wp.glb`, and a `wp-follow.glb` variant), rendered as a small cyan/mint fan at the
   waypoint and oriented to that waypoint's world heading. §4 recorded only the toggle's name.
2. **`Display Vertical Lines` draws a true vertical drop line** from the waypoint to the ground.
3. **§11 overstates what this build implements.** The `Display Gimbal Orientation` rendering shipped
   in `MapCanvas.jsx` — a 45 m tick at route bearing plus the `gimbalYaw` action angle — is **our own
   design, not observed FlightHub behaviour**, and it is inert on the M4TD, which has no Gimbal Yaw
   action. It should not be cited as a reproduction of the reference.

The camera preview details in §6 are unaffected and were re-confirmed.

**Implemented 2026-09-03.** The orientation marker and both coverage wedges now exist —
see `docs/waypoint-camera-visuals.md` §6 for the property-by-property comparison and the five
places this build knowingly differs from the reference.
