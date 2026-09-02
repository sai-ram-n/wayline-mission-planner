/**
 * WPML build and parse tests.
 *
 *   cd backend && npm test
 *
 * Two fixtures back these:
 *   - `reference-empty-route.kmz` is a genuine capture from the live editor. It
 *     has no waypoints, so it pins the element names, enums and defaults of the
 *     missionConfig and Folder halves against real data.
 *   - `synthetic-waypoint-route.kmz` is hand-authored from the §7 schema and
 *     covers placemarks, override flags and every supported action type.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildKmz, parseKmz, NAMESPACE } from '../wpml.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFile(join(here, 'fixtures', name));

const unzipText = async (buffer, path) => {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  return zip.file(path)?.async('string') ?? null;
};

/* ------------------------------------------------- the real captured export */

test('parses the captured reference export', async () => {
  const parsed = await parseKmz(await fixture('reference-empty-route.kmz'));

  // Aircraft identifiers resolve back to the model that produced the file.
  assert.equal(parsed.aircraft_series, 'M30');
  assert.equal(parsed.aircraft_model, 'M30T');
  assert.equal(parsed.route_type, 'waypoint');

  // Mission config values, verbatim from the capture.
  assert.equal(parsed.settings.flyToWaylineMode, 'safely');
  assert.equal(parsed.settings.finishAction, 'goHome');
  assert.equal(parsed.settings.takeOffSecurityHeight, 20);
  assert.equal(parsed.settings.globalTransitionalSpeed, 15);
  assert.equal(parsed.settings.globalRTHHeight, 100);

  // Folder values.
  assert.equal(parsed.settings.autoFlightSpeed, 10);
  assert.equal(parsed.settings.globalHeight, 209);
  assert.equal(parsed.settings.heightMode, 'ASL'); // EGM96
  assert.equal(parsed.settings.gimbalPitchMode, 'manual');
  assert.equal(parsed.settings.turnMode, 'toPointAndStopWithDiscontinuityCurvature');
  assert.deepEqual(parsed.settings.lenses, ['wide', 'zoom', 'ir']);

  // The capture genuinely has no waypoints.
  assert.equal(parsed.waypoints.length, 0);
});

test('builds a kmz with the expected archive layout and namespace', async () => {
  const source = await parseKmz(await fixture('reference-empty-route.kmz'));
  const kmz = await buildKmz(source);

  const template = await unzipText(kmz, 'wpmz/template.kml');
  const wpml = await unzipText(kmz, 'wpmz/waylines.wpml');

  assert.ok(template, 'wpmz/template.kml missing');
  assert.ok(wpml, 'wpmz/waylines.wpml missing');
  assert.ok(template.includes(NAMESPACE));
  assert.ok(wpml.includes(NAMESPACE));

  // template.kml carries authoring metadata; waylines.wpml does not.
  assert.ok(template.includes('<wpml:author>'));
  assert.ok(!wpml.includes('<wpml:author>'));

  // No real author is ever written out.
  assert.ok(template.includes('wayline-mission-planner'));
  assert.ok(!/@/.test(template), 'an email address leaked into the export');
});

test('a rebuilt capture still parses to the same settings', async () => {
  const original = await parseKmz(await fixture('reference-empty-route.kmz'));
  const round = await parseKmz(await buildKmz(original));

  assert.equal(round.aircraft_model, original.aircraft_model);
  assert.equal(round.route_type, original.route_type);
  for (const key of [
    'flyToWaylineMode',
    'finishAction',
    'takeOffSecurityHeight',
    'globalTransitionalSpeed',
    'globalRTHHeight',
    'autoFlightSpeed',
    'globalHeight',
    'heightMode',
    'gimbalPitchMode',
    'turnMode',
  ]) {
    assert.deepEqual(round.settings[key], original.settings[key], `settings.${key} drifted`);
  }
  assert.deepEqual(round.settings.lenses, original.settings.lenses);
});

/* ----------------------------------------------- waypoints and action groups */

test('parses placemarks, override flags and actions', async () => {
  const parsed = await parseKmz(await fixture('synthetic-waypoint-route.kmz'));

  assert.equal(parsed.waypoints.length, 4);

  const [first, second, third, fourth] = parsed.waypoints;

  assert.ok(Math.abs(first.lat - -37.8079) < 1e-6);
  assert.ok(Math.abs(first.lng - 145.2841) < 1e-6);
  assert.deepEqual(
    first.actions.map((a) => a.action_type),
    ['rotateYaw', 'gimbalYaw', 'gimbalTilt', 'zoom']
  );
  // Gimbal yaw and tilt share one actuator; the enable flags must separate them.
  assert.equal(first.actions[1].params.angle, -30);
  assert.equal(first.actions[2].params.angle, -60);
  assert.equal(first.actions[0].params.aircraftHeading, 45);
  assert.equal(first.actions[0].params.aircraftPathMode, 'clockwise');

  // Per-waypoint overrides survive.
  assert.equal(second.use_global_speed, false);
  assert.equal(second.speed, 6);
  assert.equal(second.use_global_height, false);
  assert.equal(second.height, 95);
  assert.equal(second.actions[0].action_type, 'takePhoto');
  assert.equal(second.actions[0].params.followRoute, false);
  assert.deepEqual(second.actions[0].params.lenses, ['wide', 'ir']);
  assert.equal(second.actions[1].params.hoverTime, 15);
  assert.equal(second.actions[2].params.folderName, 'SITE_A');

  // Point of interest heading.
  assert.equal(third.use_global_heading, false);
  assert.equal(third.heading_mode, 'towardPOI');
  assert.ok(Math.abs(third.poi_alt - 10) < 1e-6);
  assert.equal(third.actions[1].params.interval, 3);

  // Turn override and the parameterless actions.
  assert.equal(fourth.use_global_turn, false);
  assert.equal(fourth.turn_mode, 'coordinateTurn');
  assert.equal(fourth.turn_damping_dist, 5);
  assert.deepEqual(
    fourth.actions.map((a) => a.action_type),
    // takePhotoFixedAngle comes back as takePhoto — see the next test.
    ['stopShoot', 'stopRecord', 'panorama', 'takePhoto']
  );
});

/**
 * A known, deliberate limitation rather than a bug.
 *
 * Both Take Photo and Take Photo (Fixed Angle) map to the WPML actuator
 * `takePhoto` (constants.js ACTION_ACTUATOR, from feature-reference §7, which
 * does not record a distinct actuator for the fixed-angle variant). The format
 * as documented therefore cannot tell them apart on the way back in, and
 * inventing a non-standard element to smuggle the difference through would
 * corrupt the file for a real aircraft.
 *
 * This test exists so the loss stays visible: if the mapping is ever corrected,
 * it fails and points here.
 */
test('take photo variants collapse on import — known limitation', async () => {
  const parsed = await parseKmz(await fixture('synthetic-waypoint-route.kmz'));
  const types = parsed.waypoints.flatMap((w) => w.actions.map((a) => a.action_type));
  assert.ok(types.includes('takePhoto'));
  assert.ok(
    !types.includes('takePhotoFixedAngle'),
    'the fixed-angle variant now survives a round-trip; update this test and the README'
  );
});

test('export to import to export is stable', async () => {
  const first = await parseKmz(await fixture('synthetic-waypoint-route.kmz'));
  const second = await parseKmz(await buildKmz(first));
  const third = await parseKmz(await buildKmz(second));

  // The second and third passes must be identical — any loss shows up here.
  assert.deepEqual(second.waypoints, third.waypoints);
  assert.deepEqual(second.settings, third.settings);

  // And the first pass must already agree on everything that matters.
  assert.equal(first.waypoints.length, second.waypoints.length);
  first.waypoints.forEach((waypoint, i) => {
    const other = second.waypoints[i];
    assert.ok(Math.abs(waypoint.lat - other.lat) < 1e-7, `waypoint ${i} latitude drifted`);
    assert.ok(Math.abs(waypoint.lng - other.lng) < 1e-7, `waypoint ${i} longitude drifted`);
    assert.equal(waypoint.height, other.height);
    assert.equal(waypoint.speed, other.speed);
    assert.equal(waypoint.turn_mode, other.turn_mode);
    assert.equal(waypoint.heading_mode, other.heading_mode);
    assert.deepEqual(
      waypoint.actions.map((a) => a.action_type),
      other.actions.map((a) => a.action_type),
      `waypoint ${i} actions drifted`
    );
  });
});

test('the takeoff reference point round-trips', async () => {
  const parsed = await parseKmz(await fixture('synthetic-waypoint-route.kmz'));
  assert.ok(parsed.settings.takeOffRefPoint, 'takeOffRefPoint was dropped');
  const round = await parseKmz(await buildKmz(parsed));
  assert.ok(Math.abs(round.settings.takeOffRefPoint.lat - parsed.settings.takeOffRefPoint.lat) < 1e-6);
  assert.ok(Math.abs(round.settings.takeOffRefPoint.lng - parsed.settings.takeOffRefPoint.lng) < 1e-6);
});

/* --------------------------------------------------------------- robustness */

test('rejects files that are not kmz archives', async () => {
  await assert.rejects(() => parseKmz(Buffer.from('this is not a zip')), /not a valid .kmz/);
});

test('rejects a zip with no wpmz payload', async () => {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('readme.txt', 'nothing to see here');
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await assert.rejects(() => parseKmz(buffer), /no wpmz/);
});

test('an unknown aircraft falls back rather than throwing', async () => {
  const source = await parseKmz(await fixture('reference-empty-route.kmz'));
  const kmz = await buildKmz({ ...source, aircraft_series: 'NOPE', aircraft_model: 'NOPE' });
  const parsed = await parseKmz(kmz);
  assert.equal(parsed.aircraft_series, 'M30');
  assert.equal(parsed.aircraft_model, 'M30T');
});
