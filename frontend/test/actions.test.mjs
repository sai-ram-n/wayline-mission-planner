/**
 * Aircraft-specific action-menu and attitude-capture behaviour.
 *
 *   cd frontend && npm test
 *
 * Regression coverage for the Matrice 4D model-configuration fix: the base
 * `M4D` model previously had none of the flags its `M4TD` sibling carries
 * (excludedActions, smartLowLight, defaultZoomRatio, bypassObstacle), so a
 * Matrice 4D route wrongly offered Gimbal Yaw and defaulted Camera Zoom to 5X
 * instead of the audited 7X. `AIRCRAFT` is imported straight from the backend
 * so this test tracks the actual served /api/meta shape, not a duplicate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { AIRCRAFT } from '../../backend/constants.js';
import {
  ACTION_MENU,
  ATTITUDE_ACTIONS,
  actionMenuFor,
  attitudeActionsFor,
  defaultParams,
} from '../src/lib/actions.js';

const meta = { aircraft: AIRCRAFT };

test('Matrice 4D (base model) excludes Gimbal Yaw, like its 4TD sibling', () => {
  const menu = actionMenuFor(meta, 'M4D', 'M4D');
  assert.ok(!menu.includes('gimbalYaw'), 'gimbalYaw should not be offered on the base M4D');
  assert.equal(menu.length, ACTION_MENU.length - 1);

  const menuTD = actionMenuFor(meta, 'M4D', 'M4TD');
  assert.deepEqual(menu, menuTD, 'both M4D-series models should exclude the same actions');
});

test('Matrice 4D (base model) auto-attaches only 3 attitude actions, not 4', () => {
  const attitude = attitudeActionsFor(meta, 'M4D', 'M4D');
  assert.deepEqual(attitude, ['rotateYaw', 'gimbalTilt', 'zoom']);
  assert.equal(attitude.length, ATTITUDE_ACTIONS.length - 1);
});

test('Matrice 4D (base model) defaults Camera Zoom to 7X, not the generic 5X', () => {
  const model = AIRCRAFT.M4D.models.M4D;
  const params = defaultParams('zoom', { defaultZoomRatio: model.defaultZoomRatio });
  assert.equal(params.zoomRatio, 7);
});

test('Matrice 4D (base model) exposes Smart Low-Light and Bypass Obstacle flags', () => {
  const model = AIRCRAFT.M4D.models.M4D;
  assert.equal(model.smartLowLight, true);
  assert.equal(model.bypassObstacle, true);
});

test('other aircraft (M30T) are unaffected by the M4D fix', () => {
  const menu = actionMenuFor(meta, 'M30', 'M30T');
  assert.deepEqual(menu, ACTION_MENU);
  const attitude = attitudeActionsFor(meta, 'M30', 'M30T');
  assert.deepEqual(attitude, ATTITUDE_ACTIONS);
});
