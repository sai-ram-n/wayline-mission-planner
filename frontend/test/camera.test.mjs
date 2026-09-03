/**
 * Camera coverage maths — docs/waypoint-camera-visuals.md §2–§4.
 *
 * The figures asserted here were measured off the live FlightHub Cesium scene,
 * not chosen. Where a test encodes an assumption rather than an observation it
 * says so, so a future correction lands on the right line.
 *
 *   cd frontend && npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_RANGE_M,
  RANGE_TO_ALTITUDE_RATIO,
  hasCoverage,
  rangeFor,
  wideHFov,
  zoomHFov,
  zoomRatioAt,
} from '../src/lib/camera.js';
import { coverageWedge, headingAt, metresBetween } from '../src/lib/geo.js';

/* ------------------------------------------------------- field of view */

test('the M4TD wide field of view is the measured one', () => {
  assert.equal(wideHFov('M4TD'), 73.19);
  assert.ok(hasCoverage('M4TD'));
});

test('aircraft with no measured field of view draw nothing', () => {
  // Deliberate: inventing an FOV would put a confidently wrong footprint on the
  // map. If one is ever measured, add it and this test should be updated.
  for (const model of ['M30T', 'M3T', 'M400', 'M4D']) {
    assert.equal(wideHFov(model), null, `${model} gained an unmeasured FOV`);
    assert.equal(hasCoverage(model), false);
  }
});

/* ------------------------------------------------------------ the zoom law */

test('zooming narrows the field of view by the tangent law', () => {
  // Verified live: at Zoom 7X this predicts 12.11 deg against 12.56 measured,
  // inside the noise of a 40 m wide wedge (waypoint-camera-visuals §3).
  const wide = 73.19;
  assert.ok(Math.abs(zoomHFov(wide, 7) - 12.11) < 0.05);

  // The ratio of the tangents must be exactly the zoom ratio.
  for (const ratio of [2, 3, 7, 10, 112]) {
    const narrowed = zoomHFov(wide, ratio);
    const tangentRatio =
      Math.tan((wide * Math.PI) / 360) / Math.tan((narrowed * Math.PI) / 360);
    assert.ok(
      Math.abs(tangentRatio - ratio) < 1e-9,
      `tangent ratio ${tangentRatio} should equal zoom ${ratio}`
    );
  }
});

test('a zoom of 1X or less leaves the wide view untouched', () => {
  assert.equal(zoomHFov(73.19, 1), 73.19);
  assert.equal(zoomHFov(73.19, 0), 73.19);
  assert.equal(zoomHFov(73.19, undefined), 73.19);
});

test('the zoom ratio comes from the waypoint action, then the aircraft default', () => {
  const zoomAction = { action_type: 'zoom', params: { zoomRatio: 7 } };
  assert.equal(zoomRatioAt({ actions: [zoomAction] }, { defaultZoomRatio: 1 }), 7);
  // No action: the M4TD defaults to 1X, the M30T to 5X (m4td §8).
  assert.equal(zoomRatioAt({ actions: [] }, { defaultZoomRatio: 1 }), 1);
  assert.equal(zoomRatioAt({ actions: [] }, { defaultZoomRatio: 5 }), 5);
  assert.equal(zoomRatioAt({}, {}), 1);
});

/* ----------------------------------------------------------------- range */

test('range follows the single observed altitude ratio, and is capped', () => {
  // ~235 m was measured from an aircraft 116.3 m above ground. This is one
  // observation encoded as a ratio, NOT a rule DJI documents.
  assert.equal(rangeFor(116.3), 116.3 * RANGE_TO_ALTITUDE_RATIO);
  assert.ok(Math.abs(rangeFor(116.3) - 232.6) < 0.1);
  assert.equal(rangeFor(100000), MAX_RANGE_M);
  assert.equal(rangeFor(0), 0);
  assert.equal(rangeFor(-5), 0);
  assert.equal(rangeFor(undefined), 0);
});

/* ---------------------------------------------------------- wedge geometry */

test('the wedge spans the field of view at the requested range', () => {
  const apex = { lat: -37.8078, lng: 145.2798 };
  const ring = coverageWedge(apex.lat, apex.lng, 0, 73.19, 235, 24);

  // Closed ring: apex, 25 arc samples, apex again.
  assert.equal(ring.length, 27);
  assert.deepEqual(ring[0], [apex.lat, apex.lng]);
  assert.deepEqual(ring[ring.length - 1], [apex.lat, apex.lng]);

  // Every arc point sits at the requested range from the apex.
  for (const [lat, lng] of ring.slice(1, -1)) {
    const d = metresBetween(apex, { lat, lng });
    assert.ok(Math.abs(d - 235) < 0.5, `arc point at ${d} m, expected 235`);
  }

  // And the arc's far width matches the measured 281.3 m far edge.
  const first = ring[1];
  const last = ring[ring.length - 2];
  const width = metresBetween(
    { lat: first[0], lng: first[1] },
    { lat: last[0], lng: last[1] }
  );
  assert.ok(Math.abs(width - 281.3) < 2, `far edge ${width} m, expected ~281.3`);
});

test('a wedge with no range or no angle is empty rather than degenerate', () => {
  assert.deepEqual(coverageWedge(0, 0, 0, 73, 0), []);
  assert.deepEqual(coverageWedge(0, 0, 0, 0, 235), []);
});

/* ------------------------------------------------------ heading resolution */

test('an Aircraft Yaw action wins over every other source', () => {
  const waypoints = [
    {
      lat: 0,
      lng: 0,
      use_global_heading: false,
      heading_mode: 'manually',
      heading_angle: 10,
      actions: [{ action_type: 'rotateYaw', params: { aircraftHeading: 90 } }],
    },
    { lat: 1, lng: 0, actions: [] },
  ];
  assert.equal(headingAt(waypoints, 0, {}), 90);
});

test('negative yaw angles come back as a 0-360 compass bearing', () => {
  const waypoints = [
    { lat: 0, lng: 0, actions: [{ action_type: 'rotateYaw', params: { aircraftHeading: -90 } }] },
  ];
  assert.equal(headingAt(waypoints, 0, {}), 270);
});

test('a manual per-waypoint heading is honoured only when it overrides the global', () => {
  const base = { lat: 0, lng: 0, heading_mode: 'manually', heading_angle: 45, actions: [] };
  const next = { lat: 1, lng: 0, actions: [] };

  // Override on: use the waypoint's own angle.
  assert.equal(headingAt([{ ...base, use_global_heading: false }, next], 0, {}), 45);
  // Override off: fall back to the route setting, which here follows the line north.
  assert.equal(headingAt([{ ...base, use_global_heading: true }, next], 0, {}), 0);
});

test('a point of interest points the aircraft at it', () => {
  const waypoints = [
    {
      lat: 0,
      lng: 0,
      use_global_heading: false,
      heading_mode: 'towardPOI',
      poi_lat: 0,
      poi_lng: 1,
      actions: [],
    },
  ];
  // Due east of the waypoint.
  assert.ok(Math.abs(headingAt(waypoints, 0, {}) - 90) < 0.01);
});

test('following the route faces the next waypoint, and the last holds its arrival bearing', () => {
  const waypoints = [
    { lat: 0, lng: 0, actions: [] },
    { lat: 0, lng: 1, actions: [] },
  ];
  assert.ok(Math.abs(headingAt(waypoints, 0, {}) - 90) < 0.01);
  // No next leg: keep the bearing it arrived on rather than snapping to north.
  assert.ok(Math.abs(headingAt(waypoints, 1, {}) - 90) < 0.5);
});

test('a lone waypoint has a defined heading rather than throwing', () => {
  assert.equal(headingAt([{ lat: 0, lng: 0, actions: [] }], 0, {}), 0);
  assert.equal(headingAt([], 0, {}), 0);
});
