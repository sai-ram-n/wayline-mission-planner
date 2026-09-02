/**
 * Boustrophedon route generation for Area and Linear mapping routes
 * (docs/feature-reference.md §8.1 and §8.2).
 *
 * These are pure functions over `[lat, lng]` vertex lists, so the map preview and
 * the waypoints that get saved are produced by exactly the same code.
 *
 * On fidelity: the reference records the GSD and overlap defaults but not the
 * sensor specifications behind them, so the footprint model here uses the sensor
 * resolutions catalogued in /api/meta (`mappingSensors`) as a stated assumption.
 * The resulting distance and photo estimates are our own — they are internally
 * consistent and respond correctly to every setting, but they are not expected to
 * reproduce the reference editor's numbers exactly.
 */
import * as turf from '@turf/turf';

/* ------------------------------------------------------------------ geometry */

/** Our `[lat, lng]` convention to GeoJSON's `[lng, lat]`. */
const toPosition = ([lat, lng]) => [lng, lat];
const toLatLng = ([lng, lat]) => [lat, lng];

/** A closed GeoJSON polygon from a vertex ring, tolerating an unclosed ring. */
function polygonFrom(vertices) {
  if (!vertices || vertices.length < 3) return null;
  const ring = vertices.map(toPosition);
  const [first] = ring;
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
  try {
    return turf.polygon([ring]);
  } catch {
    return null;
  }
}

function lineFrom(vertices) {
  if (!vertices || vertices.length < 2) return null;
  try {
    return turf.lineString(vertices.map(toPosition));
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------- camera model */

/**
 * Ground footprint of one frame, and the spacings that follow from the overlaps.
 *
 * GSD is centimetres per pixel, so a frame covers `pixels × gsd / 100` metres.
 * Side overlap sets the gap between adjacent flight lines; forward overlap sets
 * the gap between consecutive photos along a line.
 */
export function footprint(settings = {}, sensor = { width: 4000, height: 3000 }) {
  const gsd = Math.max(0.1, Number(settings.gsd ?? 5));
  const widthM = (sensor.width * gsd) / 100;
  const heightM = (sensor.height * gsd) / 100;

  const side = Math.min(95, Math.max(0, Number(settings.sideOverlapRate ?? 70)));
  const forward = Math.min(95, Math.max(0, Number(settings.forwardOverlapRate ?? 80)));

  return {
    widthM,
    heightM,
    lineSpacing: Math.max(1, widthM * (1 - side / 100)),
    photoSpacing: Math.max(1, heightM * (1 - forward / 100)),
  };
}

/* -------------------------------------------------------- boustrophedon fill */

/**
 * Fill a polygon with parallel flight lines at `courseAngle`, walked alternately
 * so the aircraft flies a continuous serpentine.
 *
 * The polygon is rotated so the lines are horizontal, scanned, then each line's
 * crossings with the boundary are paired into inside-segments — which keeps
 * concave areas correct rather than assuming two crossings per line.
 */
function fillPolygon(polygon, lineSpacing, courseAngle) {
  const pivot = turf.centroid(polygon);
  const rotated = turf.transformRotate(polygon, -courseAngle, { pivot });
  const [minX, minY, maxX, maxY] = turf.bbox(rotated);

  // Scan-line spacing in degrees of latitude at this location.
  const metresPerDegLat = 111320;
  const stepDeg = lineSpacing / metresPerDegLat;
  if (!Number.isFinite(stepDeg) || stepDeg <= 0) return [];

  // Inset the first line by half a spacing so coverage is centred in the area.
  const segments = [];
  const pad = (maxX - minX) * 0.05 + 0.0001;

  for (let y = minY + stepDeg / 2; y <= maxY; y += stepDeg) {
    const scan = turf.lineString([
      [minX - pad, y],
      [maxX + pad, y],
    ]);

    const crossings = turf
      .lineIntersect(scan, rotated)
      .features.map((f) => f.geometry.coordinates)
      .sort((a, b) => a[0] - b[0]);

    // Crossings pair up into segments that lie inside the polygon.
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const a = crossings[i];
      const b = crossings[i + 1];
      const midpoint = turf.point([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      if (turf.booleanPointInPolygon(midpoint, rotated)) segments.push([a, b]);
    }
  }

  if (!segments.length) return [];

  // Serpentine: reverse every other line so the ends join up.
  const ordered = segments.map(([a, b], i) => (i % 2 ? [b, a] : [a, b]));

  // Rotate the whole set back into place in one pass.
  const back = turf.transformRotate(
    turf.multiLineString(ordered),
    courseAngle,
    { pivot }
  );
  return back.geometry.coordinates;
}

/* ------------------------------------------------------------------ waypoints */

/** Build a mission waypoint at a generated position. */
function makeWaypoint(position, settings, index) {
  return {
    id: `gen-${index}`,
    lat: position[1],
    lng: position[0],
    height: settings.globalHeight ?? 100,
    ellipsoid_height: null,
    speed: null,
    heading_mode: 'followWayline',
    heading_angle: 0,
    heading_path_mode: 'followBadArc',
    poi_lat: 0,
    poi_lng: 0,
    poi_alt: 0,
    turn_mode: settings.turnMode ?? 'toPointAndStopWithDiscontinuityCurvature',
    turn_damping_dist: 0.2,
    use_global_speed: true,
    use_global_height: true,
    use_global_heading: true,
    use_global_turn: true,
    use_straight_line: true,
    actions: [],
  };
}

/**
 * Attach the interval-shot actions that make a mapping route actually capture:
 * start at the first waypoint, stop at the last, in the configured photo mode.
 */
function withCaptureActions(waypoints, settings, photoSpacing) {
  if (waypoints.length < 2) return waypoints;

  const speed = Math.max(1, Number(settings.autoFlightSpeed ?? 15));
  const lenses = [...(settings.lenses ?? [])];
  const distanceMode = settings.photoMode === 'distanceInterval';

  const start = {
    id: 'gen-capture-start',
    action_type: distanceMode ? 'startDistanceShoot' : 'startTimedShoot',
    params: {
      // Distance mode uses the spacing directly; timed mode converts it via speed.
      interval: distanceMode
        ? Math.round(photoSpacing * 10) / 10
        : Math.round((photoSpacing / speed) * 10) / 10,
      followRoute: true,
      lenses,
      fileSuffix: '',
    },
  };

  const next = waypoints.map((w) => ({ ...w }));
  next[0] = { ...next[0], actions: [start] };
  next[next.length - 1] = {
    ...next[next.length - 1],
    actions: [{ id: 'gen-capture-stop', action_type: 'stopShoot', params: {} }],
  };
  return next;
}

/* ---------------------------------------------------------------- area route */

/**
 * Generate an Area route inside a drawn polygon (§8.1).
 * `margin` expands the surveyed area outward before filling.
 */
export function generateAreaRoute(vertices, settings = {}, sensor) {
  const polygon = polygonFrom(vertices);
  if (!polygon) return { waypoints: [], lines: [], area: 0, lineSpacing: 0 };

  const margin = Number(settings.margin ?? 0);
  let target = polygon;
  if (margin > 0) {
    const buffered = turf.buffer(polygon, margin, { units: 'meters' });
    if (buffered) target = buffered;
  }

  const { lineSpacing, photoSpacing } = footprint(settings, sensor);
  const lines = fillPolygon(target, lineSpacing, Number(settings.courseAngle ?? 0));

  const positions = lines.flat();
  let waypoints = positions.map((position, i) => makeWaypoint(position, settings, i));
  waypoints = withCaptureActions(waypoints, settings, photoSpacing);

  return {
    waypoints,
    lines: lines.map((line) => line.map(toLatLng)),
    area: turf.area(target),
    lineSpacing,
  };
}

/* -------------------------------------------------------------- linear route */

/**
 * Build the corridor around a centre line from the left and right extensions.
 * The two extensions are independent, so the corridor can be asymmetric.
 */
function corridorFrom(line, leftM, rightM) {
  // A symmetric buffer is both simpler and more robust than offsetting each side
  // separately; an asymmetric corridor is that buffer shifted onto the mid-line.
  const halfWidth = (leftM + rightM) / 2;
  if (halfWidth <= 0) return null;

  const shift = (leftM - rightM) / 2;
  let centre = line;
  if (Math.abs(shift) > 0.01) {
    try {
      centre = turf.lineOffset(line, shift, { units: 'meters' });
    } catch {
      centre = line;
    }
  }
  try {
    return turf.buffer(centre, halfWidth, { units: 'meters', steps: 8 });
  } catch {
    return null;
  }
}

/**
 * Generate a Linear route along a drawn centre line (§8.2).
 *
 * The centre line is buffered by the left/right extensions into a corridor and
 * filled with a boustrophedon pattern running parallel to the line. Long
 * corridors are cut into sections of `cuttingDistance` and flown in order, which
 * is what the Cutting Distance control is for.
 */
export function generateLinearRoute(vertices, settings = {}, sensor) {
  const line = lineFrom(vertices);
  if (!line) {
    return { waypoints: [], lines: [], area: 0, centerLineLength: 0, lineSpacing: 0 };
  }

  const left = Math.max(0, Number(settings.leftExtension ?? 50));
  const right = Math.max(0, Number(settings.rightExtension ?? 50));
  const { lineSpacing, photoSpacing } = footprint(settings, sensor);
  const centerLineLength = turf.length(line, { units: 'meters' });

  // Cut the centre line into sections so a long strip is flown in manageable runs.
  const cutting = Math.max(1, Number(settings.cuttingDistance ?? 1000));
  const sections =
    centerLineLength > cutting
      ? turf.lineChunk(line, cutting, { units: 'meters' }).features
      : [line];

  const allLines = [];
  let area = 0;

  for (const section of sections) {
    const corridor = corridorFrom(section, left, right);
    if (!corridor) continue;
    area += turf.area(corridor);

    // "Parallel to Center Line": flight lines follow the section's own bearing.
    const coords = section.geometry.coordinates;
    const bearing = turf.bearing(
      turf.point(coords[0]),
      turf.point(coords[coords.length - 1])
    );
    const courseAngle =
      settings.directionMode === 'perpendicularToCenterLine' ? bearing + 90 : bearing;

    // A single route flies one pass along the centre; zigzag fills the corridor.
    const filled =
      settings.zigzag === false
        ? [coords]
        : fillPolygon(corridor, lineSpacing, courseAngle);

    allLines.push(...filled);

    if (settings.includeCenterLine && settings.zigzag !== false) {
      allLines.push(coords);
    }
  }

  const positions = allLines.flat();
  let waypoints = positions.map((position, i) => makeWaypoint(position, settings, i));
  waypoints = withCaptureActions(waypoints, settings, photoSpacing);

  return {
    waypoints,
    lines: allLines.map((l) => l.map(toLatLng)),
    area,
    centerLineLength,
    lineSpacing,
  };
}

/** Area of a drawn polygon in square metres, for the stats bar. */
export function polygonArea(vertices) {
  const polygon = polygonFrom(vertices);
  return polygon ? turf.area(polygon) : 0;
}

/** Length of a drawn centre line in metres. */
export function lineLength(vertices) {
  const line = lineFrom(vertices);
  return line ? turf.length(line, { units: 'meters' }) : 0;
}

/** Dispatch to the right generator for a route type. */
export function generateRoute(routeType, geometry, settings, sensor) {
  if (!geometry?.vertices?.length) return null;
  if (routeType === 'area') return generateAreaRoute(geometry.vertices, settings, sensor);
  if (routeType === 'linear') return generateLinearRoute(geometry.vertices, settings, sensor);
  return null;
}
