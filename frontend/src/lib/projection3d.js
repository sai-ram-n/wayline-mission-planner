/**
 * Projection for the tilted ("3D") map view.
 *
 * The map itself stays a flat Leaflet map; the 3D view applies a CSS
 * `perspective(...) rotateX(...)` to the map container so the ground plane tilts
 * away from the viewer, and draws waypoints in an SVG overlay lifted along Z so
 * the gap between the route and the ground becomes visible.
 *
 * The overlay cannot use CSS for that lift — it has to know where each point
 * lands on screen — so `project3d` reimplements exactly what the browser does to
 * the tiles. `cssTransform` emits the matching CSS from the same numbers, which
 * is what stops the two drifting apart.
 *
 * Everything here is pure and in pixels; no DOM, no Leaflet.
 */

/** Pitch is clamped: past ~70° the ground plane approaches edge-on and inverts. */
export const MAX_PITCH = 70;
export const DEFAULT_PITCH = 45;

/**
 * How far the virtual camera sits from the plane, in pixels.
 *
 * This has to scale with the element being transformed. A fixed distance that
 * looks right on a 700px map becomes an extreme wide-angle lens once the plane
 * is drawn oversized for the tilted view, throwing the scene off screen.
 */
export const PERSPECTIVE_RATIO = 1.6;
export const DEFAULT_PERSPECTIVE = 1400;

/** Camera distance for a plane of a given height. */
export function perspectiveFor(height) {
  const h = Number(height) || 0;
  return h > 0 ? h * PERSPECTIVE_RATIO : DEFAULT_PERSPECTIVE;
}

/** Vertical exaggeration, so altitude is legible at normal planning zooms. */
export const DEFAULT_EXAGGERATION = 3;
export const MIN_EXAGGERATION = 1;
export const MAX_EXAGGERATION = 10;

/**
 * Pick an exaggeration that keeps the tallest column a readable fraction of the
 * view.
 *
 * A fixed multiplier cannot work across zoom levels: at zoom 14 a 100 m
 * waypoint is 11 px and needs exaggerating, while at zoom 17 a 400 m waypoint
 * already stands 1000 px tall and 3x throws it off the screen entirely. This
 * targets a quarter of the viewport height for the highest waypoint and clamps
 * into the range the slider offers.
 */
export function autoExaggeration(maxAltitudeMetres, lat, zoom, viewHeight) {
  const metres = Number(maxAltitudeMetres) || 0;
  if (metres <= 0 || !viewHeight) return 1;

  const truePixels = metres / metresPerPixel(lat, zoom);
  if (!Number.isFinite(truePixels) || truePixels <= 0) return 1;

  const target = viewHeight * 0.25;
  const factor = target / truePixels;
  return Math.min(MAX_EXAGGERATION, Math.max(MIN_EXAGGERATION, Math.round(factor)));
}

const EARTH_CIRCUMFERENCE = 40075016.686;
const TILE_SIZE = 256;

export const clampPitch = (pitch) => Math.min(MAX_PITCH, Math.max(0, pitch));

/**
 * Ground resolution of the Web Mercator tile pyramid at a latitude and zoom.
 *
 * Needed to turn an altitude in metres into a height in screen pixels, so the
 * vertical scale matches the horizontal one the map is already drawn at.
 */
export function metresPerPixel(lat, zoom) {
  const latitude = Math.min(85, Math.max(-85, Number(lat) || 0));
  return (
    (EARTH_CIRCUMFERENCE * Math.cos((latitude * Math.PI) / 180)) /
    (TILE_SIZE * 2 ** Number(zoom))
  );
}

/** Altitude in metres to a Z offset in pixels, including the exaggeration. */
export function altitudeToPixels(metres, lat, zoom, exaggeration = DEFAULT_EXAGGERATION) {
  const mpp = metresPerPixel(lat, zoom);
  if (!Number.isFinite(mpp) || mpp <= 0) return 0;
  return ((Number(metres) || 0) / mpp) * exaggeration;
}

/**
 * Project a point onto the tilted plane.
 *
 * `x` and `y` are container pixels as Leaflet reports them (origin top-left,
 * y downward); `z` is height above the plane in pixels. The transform matches
 * CSS `perspective(d) rotateX(pitch)` about the container centre:
 *
 *   1. move to centre-relative coordinates
 *   2. rotate about the horizontal axis, so the top of the map leans away
 *   3. divide by depth for perspective
 *   4. move back to container coordinates
 *
 * Returns `visible: false` for anything at or behind the camera plane, where the
 * perspective divide is meaningless — callers must skip those rather than
 * drawing at the resulting infinity.
 */
export function project3d({ x, y, z = 0 }, { width, height, pitch, perspective = DEFAULT_PERSPECTIVE }) {
  const cx = width / 2;
  const cy = height / 2;

  const localX = x - cx;
  const localY = y - cy;

  const theta = (clampPitch(pitch) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // Rotate about the x-axis. A positive z (altitude) lifts the point toward the
  // viewer as well as up the screen, which is what gives the column its lean.
  const rotatedY = localY * cos - z * sin;
  const depth = localY * sin + z * cos;

  const denominator = perspective - depth;
  if (denominator <= 1) {
    return { x: cx, y: cy, scale: 0, depth, visible: false };
  }

  const scale = perspective / denominator;
  return {
    x: cx + localX * scale,
    y: cy + rotatedY * scale,
    scale,
    depth,
    visible: true,
  };
}

/** The CSS applied to the map container, derived from the same numbers. */
export function cssTransform(pitch, perspective = DEFAULT_PERSPECTIVE) {
  const p = clampPitch(pitch);
  if (p === 0) return 'none';
  return `perspective(${perspective}px) rotateX(${p}deg)`;
}

/**
 * Dragging the map while tilted moves less ground per pixel near the horizon.
 * Scaling the vertical component by 1/cos(pitch) keeps panning feeling even.
 */
export function panFactor(pitch) {
  const theta = (clampPitch(pitch) * Math.PI) / 180;
  return 1 / Math.max(0.2, Math.cos(theta));
}
