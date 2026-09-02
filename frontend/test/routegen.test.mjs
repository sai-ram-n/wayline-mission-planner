/**
 * Route generation regression tests.
 *
 *   cd frontend && node --test test/routegen.test.mjs
 *
 * These assert the properties the generators must hold — coverage geometry,
 * monotonic response to every setting, and safety on degenerate input. They
 * deliberately do not assert the reference editor's exact distance and photo
 * figures: our footprint model uses catalogued sensor resolutions rather than
 * DJI's own, so those numbers are close but not identical (see routegen.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';

import {
  footprint,
  generateAreaRoute,
  generateLinearRoute,
  lineLength,
  polygonArea,
} from '../src/lib/routegen.js';

const SENSOR = { width: 4000, height: 3000 };
const LAT = -37.8079;
const LNG = 145.2841;

/** The 183.7 m x 153.1 m rectangle measured in feature-reference §8.1. */
const dLat = 153.1 / 111320;
const dLng = 183.7 / (111320 * Math.cos((LAT * Math.PI) / 180));
const RECT = [
  [LAT, LNG],
  [LAT, LNG + dLng],
  [LAT + dLat, LNG + dLng],
  [LAT + dLat, LNG],
];

const BASE = {
  gsd: 5,
  sideOverlapRate: 70,
  forwardOverlapRate: 80,
  courseAngle: 0,
  margin: 0,
  autoFlightSpeed: 15,
  globalHeight: 100,
  photoMode: 'timeInterval',
  lenses: ['wide', 'ir'],
};

const pathLength = (waypoints) =>
  waypoints.reduce((total, w, i) => {
    if (i === 0) return 0;
    const prev = waypoints[i - 1];
    return (
      total +
      turf.distance(turf.point([prev.lng, prev.lat]), turf.point([w.lng, w.lat]), {
        units: 'meters',
      })
    );
  }, 0);

/* ------------------------------------------------------------ camera model */

test('footprint derives spacing from GSD and overlap', () => {
  const f = footprint({ gsd: 5, sideOverlapRate: 70, forwardOverlapRate: 80 }, SENSOR);
  // 4000 px x 5 cm/px = 200 m across, 3000 px = 150 m along.
  assert.equal(Math.round(f.widthM), 200);
  assert.equal(Math.round(f.heightM), 150);
  assert.equal(Math.round(f.lineSpacing), 60); // 200 x (1 - 0.70)
  assert.equal(Math.round(f.photoSpacing), 30); // 150 x (1 - 0.80)
});

test('a finer GSD tightens both spacings', () => {
  const coarse = footprint({ ...BASE, gsd: 5 }, SENSOR);
  const fine = footprint({ ...BASE, gsd: 2 }, SENSOR);
  assert.ok(fine.lineSpacing < coarse.lineSpacing);
  assert.ok(fine.photoSpacing < coarse.photoSpacing);
});

/* -------------------------------------------------------------- area routes */

test('an area route covers the drawn polygon', () => {
  const result = generateAreaRoute(RECT, BASE, SENSOR);
  assert.ok(result.lines.length >= 3, 'expected several flight lines');
  assert.equal(result.waypoints.length, result.lines.length * 2);
  // Reported area matches the drawn polygon when there is no margin.
  assert.ok(Math.abs(result.area - polygonArea(RECT)) < 1);
  assert.ok(pathLength(result.waypoints) > 0);
});

test('every generated waypoint sits inside the surveyed area', () => {
  const result = generateAreaRoute(RECT, BASE, SENSOR);
  const ring = [...RECT.map(([lat, lng]) => [lng, lat])];
  ring.push(ring[0]);
  const polygon = turf.polygon([ring]);
  for (const w of result.waypoints) {
    const inside = turf.booleanPointInPolygon(turf.point([w.lng, w.lat]), polygon);
    assert.ok(inside, `waypoint ${w.lat},${w.lng} fell outside the area`);
  }
});

test('more side overlap means tighter spacing and more lines', () => {
  const loose = generateAreaRoute(RECT, { ...BASE, sideOverlapRate: 50 }, SENSOR);
  const tight = generateAreaRoute(RECT, { ...BASE, sideOverlapRate: 90 }, SENSOR);
  assert.ok(tight.lineSpacing < loose.lineSpacing);
  assert.ok(tight.lines.length > loose.lines.length);
});

test('course angle rotates the pattern', () => {
  const north = generateAreaRoute(RECT, { ...BASE, courseAngle: 0 }, SENSOR);
  const east = generateAreaRoute(RECT, { ...BASE, courseAngle: 90 }, SENSOR);
  // Flying the short axis of a rectangle is a different total distance.
  assert.notEqual(
    Math.round(pathLength(north.waypoints)),
    Math.round(pathLength(east.waypoints))
  );
});

test('margin expands the surveyed area', () => {
  const plain = generateAreaRoute(RECT, BASE, SENSOR);
  const margined = generateAreaRoute(RECT, { ...BASE, margin: 50 }, SENSOR);
  assert.ok(margined.area > plain.area);
});

test('a concave area is not filled across its notch', () => {
  // An L-shape: a naive two-crossings-per-line fill would bridge the missing corner.
  const shape = [
    [LAT, LNG],
    [LAT, LNG + dLng],
    [LAT + dLat / 2, LNG + dLng],
    [LAT + dLat / 2, LNG + dLng / 2],
    [LAT + dLat, LNG + dLng / 2],
    [LAT + dLat, LNG],
  ];
  const result = generateAreaRoute(shape, { ...BASE, sideOverlapRate: 85 }, SENSOR);
  assert.ok(result.lines.length > 0);
  assert.ok(Math.abs(result.area - polygonArea(shape)) < 1);

  const ring = [...shape.map(([lat, lng]) => [lng, lat])];
  ring.push(ring[0]);
  const polygon = turf.polygon([ring]);
  for (const w of result.waypoints) {
    assert.ok(
      turf.booleanPointInPolygon(turf.point([w.lng, w.lat]), polygon),
      'a generated waypoint escaped the concave area'
    );
  }
});

test('capture actions bracket the route', () => {
  const result = generateAreaRoute(RECT, BASE, SENSOR);
  assert.equal(result.waypoints[0].actions[0].action_type, 'startTimedShoot');
  assert.equal(result.waypoints.at(-1).actions[0].action_type, 'stopShoot');

  const distance = generateAreaRoute(RECT, { ...BASE, photoMode: 'distanceInterval' }, SENSOR);
  assert.equal(distance.waypoints[0].actions[0].action_type, 'startDistanceShoot');
  // In distance mode the interval is the photo spacing itself.
  assert.equal(Math.round(distance.waypoints[0].actions[0].params.interval), 30);
});

/* ------------------------------------------------------------ linear routes */

const CENTRE = [
  [LAT, LNG],
  [LAT + dLat, LNG + dLng],
  [LAT + dLat * 1.5, LNG + dLng * 2],
];

test('a linear route fills the corridor around its centre line', () => {
  const result = generateLinearRoute(
    CENTRE,
    { ...BASE, leftExtension: 50, rightExtension: 50, cuttingDistance: 1000 },
    SENSOR
  );
  assert.ok(result.waypoints.length > 2);
  assert.ok(result.area > 0);
  assert.ok(Math.abs(result.centerLineLength - lineLength(CENTRE)) < 0.5);
});

test('wider extensions survey more ground', () => {
  const narrow = generateLinearRoute(
    CENTRE,
    { ...BASE, leftExtension: 25, rightExtension: 25 },
    SENSOR
  );
  const wide = generateLinearRoute(
    CENTRE,
    { ...BASE, leftExtension: 150, rightExtension: 150 },
    SENSOR
  );
  assert.ok(wide.area > narrow.area);
});

test('single route mode flies the centre line only', () => {
  const single = generateLinearRoute(CENTRE, { ...BASE, zigzag: false }, SENSOR);
  assert.equal(single.waypoints.length, CENTRE.length);
});

test('cutting distance splits a long corridor into sections', () => {
  const whole = generateLinearRoute(CENTRE, { ...BASE, cuttingDistance: 10000 }, SENSOR);
  const cut = generateLinearRoute(CENTRE, { ...BASE, cuttingDistance: 100 }, SENSOR);
  assert.ok(cut.lines.length > whole.lines.length);
});

test('include centre line adds a pass', () => {
  const without = generateLinearRoute(CENTRE, { ...BASE, includeCenterLine: false }, SENSOR);
  const with_ = generateLinearRoute(CENTRE, { ...BASE, includeCenterLine: true }, SENSOR);
  assert.ok(with_.lines.length > without.lines.length);
});

/* --------------------------------------------------------------- robustness */

test('degenerate geometry produces no route and does not throw', () => {
  assert.equal(generateAreaRoute([], BASE, SENSOR).waypoints.length, 0);
  assert.equal(generateAreaRoute([[LAT, LNG]], BASE, SENSOR).waypoints.length, 0);
  assert.equal(generateAreaRoute(null, BASE, SENSOR).waypoints.length, 0);
  assert.equal(generateLinearRoute([[LAT, LNG]], BASE, SENSOR).waypoints.length, 0);
  assert.equal(generateLinearRoute(null, BASE, SENSOR).waypoints.length, 0);
  assert.equal(polygonArea([]), 0);
  assert.equal(lineLength([]), 0);
});

test('a zero-width corridor is rejected rather than crashing', () => {
  const result = generateLinearRoute(
    CENTRE,
    { ...BASE, leftExtension: 0, rightExtension: 0 },
    SENSOR
  );
  assert.equal(result.waypoints.length, 0);
});
