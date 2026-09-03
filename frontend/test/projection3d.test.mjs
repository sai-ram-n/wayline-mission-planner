/**
 * Projection tests for the tilted map view.
 *
 *   cd frontend && npm test
 *
 * These pin the properties the overlay depends on: that a flat view is a no-op,
 * that altitude always reads as "higher up the screen", and that degenerate
 * geometry is refused rather than producing NaN or Infinity coordinates.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PERSPECTIVE,
  MAX_PITCH,
  altitudeToPixels,
  clampPitch,
  cssTransform,
  metresPerPixel,
  panFactor,
  project3d,
} from '../src/lib/projection3d.js';

const VIEW = { width: 1000, height: 600, pitch: 45, perspective: DEFAULT_PERSPECTIVE };

/* ------------------------------------------------------------------- scale */

test('metres per pixel follows the Web Mercator pyramid', () => {
  // Halving the ground resolution per zoom level is the defining property.
  const z14 = metresPerPixel(17.385, 14);
  const z15 = metresPerPixel(17.385, 15);
  assert.ok(Math.abs(z14 / z15 - 2) < 1e-9);

  // Sanity against the documented value at the equator, zoom 0.
  assert.ok(Math.abs(metresPerPixel(0, 0) - 156543.03) < 1);
});

test('metres per pixel shrinks away from the equator', () => {
  assert.ok(metresPerPixel(60, 14) < metresPerPixel(0, 14));
});

test('altitude in pixels scales with exaggeration and zoom', () => {
  const plain = altitudeToPixels(100, 17.385, 14, 1);
  const tripled = altitudeToPixels(100, 17.385, 14, 3);
  assert.ok(Math.abs(tripled / plain - 3) < 1e-9);

  // Zooming in makes the same altitude taller on screen.
  assert.ok(altitudeToPixels(100, 17.385, 18, 1) > plain);

  // The documented figure that motivated the exaggeration control.
  assert.ok(Math.round(plain) === 11, `expected ~11 px, got ${plain}`);
});

/* -------------------------------------------------------------- projection */

test('a flat view leaves ground points where they are', () => {
  const flat = { ...VIEW, pitch: 0 };
  for (const point of [
    { x: 0, y: 0 },
    { x: 500, y: 300 },
    { x: 999, y: 599 },
  ]) {
    const out = project3d(point, flat);
    assert.ok(out.visible);
    assert.ok(Math.abs(out.x - point.x) < 1e-9, 'x moved in a flat view');
    assert.ok(Math.abs(out.y - point.y) < 1e-9, 'y moved in a flat view');
    assert.ok(Math.abs(out.scale - 1) < 1e-9);
  }
});

test('the centre of the view is the pivot and never moves', () => {
  const out = project3d({ x: 500, y: 300 }, VIEW);
  assert.ok(Math.abs(out.x - 500) < 1e-9);
  assert.ok(Math.abs(out.y - 300) < 1e-9);
});

test('altitude always moves a point up the screen', () => {
  const ground = project3d({ x: 500, y: 400, z: 0 }, VIEW);
  let previous = ground.y;
  for (const z of [10, 50, 100, 250, 500]) {
    const lifted = project3d({ x: 500, y: 400, z }, VIEW);
    assert.ok(lifted.visible, `z=${z} should be visible`);
    assert.ok(lifted.y < previous, `z=${z} did not rise above z=${previous}`);
    previous = lifted.y;
  }
});

test('tilting pushes the far edge toward the horizon', () => {
  // A point above the centre is "far away"; tilting should compress it downward
  // toward the vanishing point rather than off the top of the view.
  const flat = project3d({ x: 500, y: 50 }, { ...VIEW, pitch: 0 });
  const tilted = project3d({ x: 500, y: 50 }, VIEW);
  assert.ok(tilted.y > flat.y, 'the far edge did not compress toward the horizon');
  assert.ok(tilted.scale < 1, 'the far edge should shrink');
});

test('near ground is magnified, far ground is shrunk', () => {
  const near = project3d({ x: 500, y: 550 }, VIEW);
  const far = project3d({ x: 500, y: 50 }, VIEW);
  assert.ok(near.scale > 1);
  assert.ok(far.scale < 1);
  assert.ok(near.scale > far.scale);
});

test('points at or behind the camera are refused, not returned as infinity', () => {
  // An extreme height at a steep pitch puts the point past the camera plane.
  const out = project3d({ x: 500, y: 300, z: 10_000 }, { ...VIEW, pitch: MAX_PITCH });
  assert.equal(out.visible, false);
  assert.ok(Number.isFinite(out.x) && Number.isFinite(out.y), 'refused points must stay finite');
});

test('every projected coordinate is finite across the pitch range', () => {
  for (let pitch = 0; pitch <= MAX_PITCH; pitch += 5) {
    for (const y of [0, 150, 300, 450, 600]) {
      for (const z of [0, 100, 400]) {
        const out = project3d({ x: 500, y, z }, { ...VIEW, pitch });
        assert.ok(Number.isFinite(out.x), `x not finite at pitch ${pitch}`);
        assert.ok(Number.isFinite(out.y), `y not finite at pitch ${pitch}`);
      }
    }
  }
});

/* ------------------------------------------------------------------ clamps */

test('pitch is clamped to a range where the plane cannot invert', () => {
  assert.equal(clampPitch(-30), 0);
  assert.equal(clampPitch(45), 45);
  assert.equal(clampPitch(120), MAX_PITCH);
});

/* --------------------------------------------------------------------- css */

test('the CSS transform is derived from the same pitch as the maths', () => {
  assert.equal(cssTransform(0), 'none');
  assert.equal(cssTransform(45), `perspective(${DEFAULT_PERSPECTIVE}px) rotateX(45deg)`);
  // Clamping must apply to the CSS too, or the tiles and overlay would disagree.
  assert.equal(cssTransform(120), `perspective(${DEFAULT_PERSPECTIVE}px) rotateX(${MAX_PITCH}deg)`);
});

test('camera distance scales with the plane, not a fixed pixel value', async () => {
  const { perspectiveFor, PERSPECTIVE_RATIO, DEFAULT_PERSPECTIVE } = await import(
    '../src/lib/projection3d.js'
  );
  // A fixed distance on an oversized plane is an extreme wide-angle lens and
  // throws the scene off screen, so it must track the element height.
  assert.equal(perspectiveFor(1000), 1000 * PERSPECTIVE_RATIO);
  assert.ok(perspectiveFor(1600) > perspectiveFor(800));
  assert.equal(perspectiveFor(0), DEFAULT_PERSPECTIVE);
  assert.equal(perspectiveFor(undefined), DEFAULT_PERSPECTIVE);
});

test('a taller plane keeps the same relative geometry', async () => {
  const { perspectiveFor } = await import('../src/lib/projection3d.js');
  // The same fractional position in the view should project to the same
  // fractional position, whatever the plane size — that is what stops the
  // oversized 3D plane distorting differently from the flat one.
  const small = { width: 1000, height: 600, pitch: 45, perspective: perspectiveFor(600) };
  const large = { width: 2000, height: 1200, pitch: 45, perspective: perspectiveFor(1200) };

  const a = project3d({ x: 500, y: 450, z: 60 }, small);
  const b = project3d({ x: 1000, y: 900, z: 120 }, large);

  assert.ok(Math.abs(a.x / small.width - b.x / large.width) < 1e-9);
  assert.ok(Math.abs(a.y / small.height - b.y / large.height) < 1e-9);
});

test('panning compensates for foreshortening as pitch increases', () => {
  assert.ok(Math.abs(panFactor(0) - 1) < 1e-9);
  assert.ok(panFactor(60) > panFactor(30));
  assert.ok(Number.isFinite(panFactor(MAX_PITCH)));
});
