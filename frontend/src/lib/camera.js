/**
 * Camera coverage geometry — docs/waypoint-camera-visuals.md.
 *
 * FlightHub draws two translucent wedges on the map: an amber one at the wide
 * lens's field of view, and a green one narrowed by the current zoom ratio. §2
 * of that document establishes what they mean and §3 the numbers, all measured
 * off the live Cesium scene rather than guessed.
 *
 * Two deliberate departures from the reference, both forced and both recorded:
 *
 * 1. FlightHub projects these from a *flying virtual aircraft*. This build has
 *    no virtual flight (feature-reference §12), so the wedges are projected from
 *    each waypoint instead, using that waypoint's heading and zoom action. The
 *    reference's amber cone did not follow the aircraft and sat at the recorded
 *    waypoint attitude, so a per-waypoint amber wedge is the closest honest
 *    reading — but what it is anchored to was never established (§2), so this is
 *    our interpretation, not a reproduction.
 *
 * 2. The wedge's *range* was measured once (~235 m from an aircraft 116.3 m above
 *    ground) and no rule was established for it. `rangeFor` below encodes that
 *    single observation as a ratio and says so.
 */

/**
 * Horizontal field of view of the wide lens, in degrees, per aircraft model.
 *
 * Only the Matrice 4TD was measured: 73.19°, agreeing between an independent
 * screen-space measurement and a ground-truth ray pick, and consistent with
 * DJI's published ~84° diagonal for that lens (waypoint-camera-visuals §3).
 *
 * Every other aircraft is absent on purpose. Inventing a field of view would put
 * a confidently-wrong footprint on the map, so models without a measured value
 * simply do not draw coverage — see `hasCoverage`.
 */
export const WIDE_HFOV_DEG = {
  M4TD: 73.19,
};

/** The single observed range-to-altitude ratio. See the module note. */
export const RANGE_TO_ALTITUDE_RATIO = 2;

/** Widest wedge we will draw, so a high waypoint cannot flood the map. */
export const MAX_RANGE_M = 1500;

/** Can this aircraft draw a coverage wedge at all? */
export function hasCoverage(model) {
  return Boolean(WIDE_HFOV_DEG[model]);
}

/** The wide lens's horizontal FOV for a model, or null when never measured. */
export function wideHFov(model) {
  return WIDE_HFOV_DEG[model] ?? null;
}

/**
 * Horizontal FOV once the lens is zoomed.
 *
 * Confirmed against the live site: at `Zoom 7X` this predicts 12.11° where 12.56°
 * was measured, inside the noise of a 40 m-wide wedge (§3).
 */
export function zoomHFov(wideFovDeg, zoomRatio) {
  const ratio = Number(zoomRatio);
  if (!Number.isFinite(ratio) || ratio <= 1) return wideFovDeg;
  const half = (wideFovDeg * Math.PI) / 360;
  return (2 * Math.atan(Math.tan(half) / ratio) * 180) / Math.PI;
}

/**
 * How far the wedge reaches, in metres.
 *
 * Derived from the waypoint's height above the takeoff point. This is the single
 * measured ratio, not a rule DJI documents — see the module note.
 */
export function rangeFor(heightMetres) {
  const height = Number(heightMetres);
  if (!Number.isFinite(height) || height <= 0) return 0;
  return Math.min(height * RANGE_TO_ALTITUDE_RATIO, MAX_RANGE_M);
}

/**
 * The zoom ratio in force at a waypoint.
 *
 * A `zoom` action sets it; otherwise the aircraft's default applies (1X on the
 * M4TD, 5X on the M30T — m4td-waypoint-editor §8).
 */
export function zoomRatioAt(waypoint, settings) {
  const action = (waypoint?.actions ?? []).find((a) => a.action_type === 'zoom');
  const fromAction = Number(action?.params?.zoomRatio);
  if (Number.isFinite(fromAction) && fromAction > 0) return fromAction;
  const fallback = Number(settings?.defaultZoomRatio);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
}
