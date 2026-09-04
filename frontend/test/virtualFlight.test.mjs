/**
 * Virtual-flight movement steps (lib/virtualFlight.js).
 *
 *   cd frontend && npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALT_STEP_M,
  MAX_ALTITUDE_M,
  MIN_ALTITUDE_M,
  MOVE_STEP_M,
  stepVirtualFlight,
} from '../src/lib/virtualFlight.js';
import { metresBetween, bearingBetween } from '../src/lib/geo.js';

const BASE = { lat: 10, lng: 20, height: 100, heading: 0 };

test('w moves forward along the current heading by MOVE_STEP_M', () => {
  const next = stepVirtualFlight(BASE, 'w');
  const distance = metresBetween(BASE, next);
  assert.ok(Math.abs(distance - MOVE_STEP_M) < 0.01);
  const bearing = bearingBetween(BASE, next);
  assert.ok(Math.abs(bearing - 0) < 0.5, `expected bearing ~0, got ${bearing}`);
});

test('s moves backward — opposite bearing from w', () => {
  const forward = stepVirtualFlight(BASE, 'w');
  const backward = stepVirtualFlight(BASE, 's');
  const bearing = bearingBetween(BASE, backward);
  assert.ok(Math.abs(((bearing - 180 + 540) % 360) - 180) < 0.5 || Math.abs(bearing - 180) < 0.5);
  // Forward and backward land on opposite sides of the start point.
  assert.notEqual(forward.lat, backward.lat);
});

test('a and d strafe perpendicular to heading, in opposite directions', () => {
  const left = stepVirtualFlight(BASE, 'a');
  const right = stepVirtualFlight(BASE, 'd');
  const leftBearing = bearingBetween(BASE, left);
  const rightBearing = bearingBetween(BASE, right);
  assert.ok(Math.abs(leftBearing - 270) < 0.5, `expected ~270, got ${leftBearing}`);
  assert.ok(Math.abs(rightBearing - 90) < 0.5, `expected ~90, got ${rightBearing}`);
});

test('q and e yaw by YAW_STEP_DEG and wrap at 0/360', () => {
  assert.equal(stepVirtualFlight(BASE, 'e').heading, 15);
  assert.equal(stepVirtualFlight(BASE, 'q').heading, 345);
  assert.equal(stepVirtualFlight({ ...BASE, heading: 350 }, 'e').heading, 5);
});

test('c and z change altitude by ALT_STEP_M and clamp to the documented range', () => {
  assert.equal(stepVirtualFlight(BASE, 'c').height, 100 + ALT_STEP_M);
  assert.equal(stepVirtualFlight(BASE, 'z').height, 100 - ALT_STEP_M);
  assert.equal(stepVirtualFlight({ ...BASE, height: MAX_ALTITUDE_M }, 'c').height, MAX_ALTITUDE_M);
  assert.equal(stepVirtualFlight({ ...BASE, height: MIN_ALTITUDE_M }, 'z').height, MIN_ALTITUDE_M);
});

test('an unrecognised key leaves the state unchanged', () => {
  const next = stepVirtualFlight(BASE, 'x');
  assert.deepEqual(next, BASE);
});

test('movement is relative to the current heading, not always north', () => {
  const east = { ...BASE, heading: 90 };
  const next = stepVirtualFlight(east, 'w');
  const bearing = bearingBetween(east, next);
  assert.ok(Math.abs(bearing - 90) < 0.5, `expected ~90, got ${bearing}`);
});
