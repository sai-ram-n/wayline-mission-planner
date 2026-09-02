/**
 * Route geometry and flight statistics.
 *
 * The four figures shown in the editor header — Flight Distance, Flight Duration,
 * Waypoints and Photos — are derived here. The reference editor recomputes these
 * live as actions are added (feature-reference §6, behavioural rules 3 and 4), so
 * the photo count walks the route as a small state machine rather than just
 * counting shutter actions.
 */
import { point, lineString } from '@turf/helpers';
import distance from '@turf/distance';
import bearing from '@turf/bearing';
import destination from '@turf/destination';
import length from '@turf/length';

/** Ground distance between two waypoints, in metres. */
export function metresBetween(a, b) {
  return distance(point([a.lng, a.lat]), point([b.lng, b.lat]), { units: 'meters' });
}

/**
 * 3D leg distance including the altitude change, which matters for duration on
 * steep climbs between waypoints.
 */
export function legDistance(a, b) {
  const ground = metresBetween(a, b);
  const rise = (b.height ?? 0) - (a.height ?? 0);
  return Math.sqrt(ground * ground + rise * rise);
}

/** Compass bearing from a to b, 0–360°. */
export function bearingBetween(a, b) {
  const deg = bearing(point([a.lng, a.lat]), point([b.lng, b.lat]));
  return (deg + 360) % 360;
}

/**
 * A point `metres` away from lat/lng along a compass bearing, as `[lat, lng]`.
 * Used for the short orientation and altitude cue lines on the map.
 */
export function offsetLatLng(lat, lng, bearingDegrees, metres) {
  const target = destination(point([lng, lat]), metres / 1000, bearingDegrees, {
    units: 'kilometers',
  });
  const [outLng, outLat] = target.geometry.coordinates;
  return [outLat, outLng];
}

/** Total ground path length in metres. */
export function totalDistance(waypoints) {
  if (!waypoints || waypoints.length < 2) return 0;
  const line = lineString(waypoints.map((w) => [w.lng, w.lat]));
  return length(line, { units: 'kilometers' }) * 1000;
}

/** Effective speed for the leg leaving a waypoint, honouring per-waypoint overrides. */
function speedAt(waypoint, settings) {
  const globalSpeed = settings?.autoFlightSpeed ?? 10;
  if (waypoint.use_global_speed === false && waypoint.speed) return waypoint.speed;
  return globalSpeed;
}

/** Altitude of a waypoint, honouring the per-waypoint height override. */
export function heightAt(waypoint, settings) {
  if (waypoint.use_global_height === false && waypoint.height != null) return waypoint.height;
  return waypoint.height ?? settings?.globalHeight ?? 100;
}

/** Turn modes where the aircraft comes to a stop, costing a little time. */
const STOPPING_TURN_MODES = new Set([
  'toPointAndStopWithDiscontinuityCurvature',
  'toPointAndStopWithContinuityCurvature',
]);
const STOP_PENALTY_SECONDS = 1.5;

/**
 * Walk the route accumulating duration and photo count.
 *
 * Interval shots are stateful: `startTimedShoot` begins capturing every N
 * seconds and `startDistanceShoot` every N metres, both running until a
 * `stopShoot`. This mirrors the observed behaviour where starting a 3-second
 * interval jumped the photo count to 25 and ending it dropped it back to 4.
 */
export function computeStats(waypoints = [], settings = {}) {
  const stats = {
    distance: 0,
    duration: 0,
    waypoints: waypoints.length,
    photos: 0,
  };
  if (!waypoints.length) return stats;

  // Active interval capture, carried across legs until stopped.
  let timedInterval = null; // seconds
  let distanceInterval = null; // metres

  const applyActions = (waypoint) => {
    for (const action of waypoint.actions ?? []) {
      const p = action.params ?? {};
      switch (action.action_type) {
        case 'takePhoto':
        case 'takePhotoFixedAngle':
          stats.photos += 1;
          break;
        case 'panorama':
          // A panorama is a burst; count it as one capture event.
          stats.photos += 1;
          break;
        case 'hover':
          stats.duration += Number(p.hoverTime ?? 10);
          break;
        case 'startTimedShoot':
          timedInterval = Math.max(0.5, Number(p.interval ?? 3));
          distanceInterval = null;
          break;
        case 'startDistanceShoot':
          distanceInterval = Math.max(0.5, Number(p.interval ?? 10));
          timedInterval = null;
          break;
        case 'stopShoot':
          timedInterval = null;
          distanceInterval = null;
          break;
        // Gimbal/yaw/zoom moves are fast enough to ignore in an estimate.
        default:
          break;
      }
    }
  };

  applyActions(waypoints[0]);

  for (let i = 1; i < waypoints.length; i += 1) {
    const from = waypoints[i - 1];
    const to = waypoints[i];

    const legMetres = legDistance(
      { ...from, height: heightAt(from, settings) },
      { ...to, height: heightAt(to, settings) }
    );
    const legSeconds = legMetres / speedAt(from, settings);

    stats.distance += metresBetween(from, to);
    stats.duration += legSeconds;

    const turnMode = to.use_global_turn === false ? to.turn_mode : settings.turnMode;
    if (STOPPING_TURN_MODES.has(turnMode)) stats.duration += STOP_PENALTY_SECONDS;

    if (timedInterval) stats.photos += Math.floor(legSeconds / timedInterval);
    if (distanceInterval) stats.photos += Math.floor(legMetres / distanceInterval);

    applyActions(to);
  }

  // Climbing to the first waypoint from the takeoff point.
  const takeoffSpeed = settings.globalTransitionalSpeed ?? 15;
  stats.duration += heightAt(waypoints[0], settings) / takeoffSpeed;

  return stats;
}

/** "1 m 40 s" / "45 s" / "1 h 4 m", matching the reference editor's format. */
export function formatDuration(seconds) {
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours) return `${hours} h ${minutes} m`;
  return `${minutes} m ${secs} s`;
}

/** "160.6 m" below a kilometre, "1.61 km" above. */
export function formatDistance(metres) {
  if (metres < 1000) return `${metres.toFixed(1)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

/** "28,111 m²" / "2.81 ha" for mapping-route areas. */
export function formatArea(squareMetres) {
  if (!squareMetres) return '0 m²';
  if (squareMetres < 10000) return `${Math.round(squareMetres).toLocaleString()} m²`;
  return `${(squareMetres / 10000).toFixed(2)} ha`;
}

/**
 * Bounds that fit every waypoint, as Leaflet expects them, or null when there is
 * nothing to fit.
 */
export function waypointBounds(waypoints) {
  if (!waypoints?.length) return null;
  const lats = waypoints.map((w) => w.lat);
  const lngs = waypoints.map((w) => w.lng);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

/**
 * An SVG path for a library preview thumbnail: the route normalised into a
 * `width` × `height` box with a small padding, preserving aspect ratio.
 */
export function routeToSvgPath(path, width = 160, height = 90, padding = 8) {
  if (!path || path.length < 2) return '';

  const lats = path.map((p) => p[0]);
  const lngs = path.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const spanLat = maxLat - minLat || 1e-6;
  const spanLng = maxLng - minLng || 1e-6;

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const scale = Math.min(innerW / spanLng, innerH / spanLat);

  // Centre the route within the box.
  const offsetX = padding + (innerW - spanLng * scale) / 2;
  const offsetY = padding + (innerH - spanLat * scale) / 2;

  return path
    .map(([lat, lng], i) => {
      const x = offsetX + (lng - minLng) * scale;
      // SVG y grows downward, latitude grows upward.
      const y = offsetY + (maxLat - lat) * scale;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
