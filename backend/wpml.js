/**
 * DJI WPML 1.0.6 KMZ build and parse — the interchange format.
 *
 * A wayline `.kmz` is a zip containing `wpmz/template.kml` (the authoring
 * template) and `wpmz/waylines.wpml` (the executable route). Both use the
 * namespace http://www.dji.com/wpmz/1.0.6.
 *
 * Every element name, enum and default here comes from docs/feature-reference.md
 * §7, which was written from a genuine export captured during the exploration —
 * `test/fixtures/reference-empty-route.kmz`. That capture had no waypoints, so
 * the Placemark and actionGroup halves follow the documented schema rather than
 * an observed file; `test/fixtures/synthetic-waypoint-route.kmz` covers them.
 */
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

import {
  ACTION_ACTUATOR,
  AIRCRAFT,
  DEFAULT_SETTINGS,
  HEIGHT_MODES,
  TEMPLATE_TYPE,
  UNVERIFIED_WPML_ACTIONS,
} from './constants.js';

const NAMESPACE = 'http://www.dji.com/wpmz/1.0.6';
const AUTHOR = 'wayline-mission-planner';

/**
 * Our own metadata, carried alongside the WPML rather than inside it.
 *
 * Only the Matrice 30 series' `droneEnumValue` was ever captured from a real
 * export, so every other aircraft would otherwise export with a zero identifier
 * and come back unrecognised. Writing invented identifiers into the WPML is not
 * an option — the file claims to be DJI's format and a real aircraft reads it.
 *
 * Instead the two DJI-facing files stay exactly as the schema specifies and this
 * sidecar records what they cannot. A `.kmz` is a zip; DJI's tooling reads
 * `wpmz/template.kml` and `wpmz/waylines.wpml` by path, so an extra entry is
 * inert to it. Import uses the sidecar when present and falls back to the WPML
 * identifiers when reading someone else's file.
 */
const SIDECAR_PATH = 'wpmz/wayline-mission-planner.json';
const SIDECAR_VERSION = 1;

/* ------------------------------------------------------------------ helpers */

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const tag = (name, value) => `<wpml:${name}>${esc(value)}</wpml:${name}>`;

/** Fixed-precision coordinate triple, the form the reference file uses. */
const point = (lat, lng, alt = 0) =>
  `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)},${Number(alt).toFixed(6)}`;

const bool = (value) => (value ? 1 : 0);

/**
 * Altitude mode ⇄ WPML `heightMode`.
 * §7 records EGM96 ⇒ ASL; the relative and terrain-following modes use the
 * documented DJI enum names.
 */
const HEIGHT_MODE_TO_WPML = {
  ASL: 'EGM96',
  ALT: 'relativeToStartPoint',
  AGL: 'realTimeFollowSurface',
};
const WPML_TO_HEIGHT_MODE = Object.fromEntries(
  Object.entries(HEIGHT_MODE_TO_WPML).map(([k, v]) => [v, k])
);

/** Look up the WPML drone/payload identifiers for one of our aircraft models. */
function aircraftInfo(series, model) {
  const seriesEntry = AIRCRAFT[series];
  const modelEntry = seriesEntry?.models?.[model];
  return {
    droneEnumValue: seriesEntry?.droneEnumValue ?? 0,
    droneSubEnumValue: modelEntry?.droneSubEnumValue ?? 0,
    payloadEnumValue: modelEntry?.payload?.payloadEnumValue ?? 0,
    payloadSubEnumValue: modelEntry?.payload?.payloadSubEnumValue ?? 0,
  };
}

/**
 * Reverse the lookup on import, so a round-trip lands on the same model.
 *
 * **Known limitation.** Only the Matrice 30 series' `droneEnumValue` (67) was
 * ever observed in a real export (feature-reference §7); no other aircraft's
 * identifiers were captured, and inventing them would write false data into a
 * file that claims to be DJI WPML. Those aircraft therefore export with
 * `droneEnumValue 0` and cannot be recognised on the way back in — a Matrice
 * 4TD route re-imports as the fallback aircraft, not as itself.
 *
 * Returns null when the identifiers do not resolve, so the caller decides what
 * to do rather than this silently asserting a model.
 */
function modelFromInfo(droneEnumValue, droneSubEnumValue) {
  // 0/0 means "not recorded", not "the aircraft whose values happen to be zero".
  if (!droneEnumValue) return null;
  for (const [seriesKey, series] of Object.entries(AIRCRAFT)) {
    if (series.droneEnumValue !== droneEnumValue) continue;
    for (const [modelKey, model] of Object.entries(series.models ?? {})) {
      if ((model.droneSubEnumValue ?? 0) === droneSubEnumValue) {
        return { aircraft_series: seriesKey, aircraft_model: modelKey };
      }
    }
  }
  return null;
}

/* -------------------------------------------------------------------- build */

function missionConfig(settings, wayline) {
  const info = aircraftInfo(wayline.aircraft_series, wayline.aircraft_model);
  const takeoff = settings.takeOffRefPoint;

  return [
    '    <wpml:missionConfig>',
    `      ${tag('flyToWaylineMode', settings.flyToWaylineMode ?? 'safely')}`,
    `      ${tag('finishAction', settings.finishAction ?? 'goHome')}`,
    `      ${tag('exitOnRCLost', settings.exitOnRCLost ?? 'goContinue')}`,
    `      ${tag('executeRCLostAction', settings.executeRCLostAction ?? 'goBack')}`,
    `      ${tag('takeOffSecurityHeight', settings.takeOffSecurityHeight ?? 20)}`,
    takeoff
      ? `      ${tag('takeOffRefPoint', point(takeoff.lat, takeoff.lng, takeoff.alt ?? 0))}\n` +
        `      ${tag('takeOffRefPointAGLHeight', 0)}`
      : null,
    `      ${tag('globalTransitionalSpeed', settings.globalTransitionalSpeed ?? 15)}`,
    `      ${tag('globalRTHHeight', settings.globalRTHHeight ?? 100)}`,
    '      <wpml:droneInfo>',
    `        ${tag('droneEnumValue', info.droneEnumValue)}`,
    `        ${tag('droneSubEnumValue', info.droneSubEnumValue)}`,
    '      </wpml:droneInfo>',
    `      ${tag('waylineAvoidLimitAreaMode', 0)}`,
    '      <wpml:payloadInfo>',
    `        ${tag('payloadEnumValue', info.payloadEnumValue)}`,
    `        ${tag('payloadSubEnumValue', info.payloadSubEnumValue)}`,
    `        ${tag('payloadPositionIndex', 0)}`,
    '      </wpml:payloadInfo>',
    '    </wpml:missionConfig>',
  ]
    .filter(Boolean)
    .join('\n');
}

/** One `wpml:action` inside a waypoint's action group. */
function actionXml(action, index) {
  const p = action.params ?? {};
  const func = ACTION_ACTUATOR[action.action_type] ?? action.action_type;
  const params = [];

  switch (action.action_type) {
    case 'rotateYaw':
      params.push(
        tag('aircraftHeading', Math.round(p.aircraftHeading ?? 0)),
        tag('aircraftPathMode', p.aircraftPathMode ?? 'counterClockwise')
      );
      break;

    // Gimbal yaw and tilt are both gimbalRotate; the enable flags say which.
    case 'gimbalYaw':
    case 'gimbalTilt': {
      const isTilt = action.action_type === 'gimbalTilt';
      params.push(
        tag('gimbalHeadingYawBase', 'north'),
        tag('gimbalRotateMode', 'absoluteAngle'),
        tag('gimbalPitchRotateEnable', bool(isTilt)),
        tag('gimbalPitchRotateAngle', isTilt ? (p.angle ?? 0) : 0),
        tag('gimbalRollRotateEnable', 0),
        tag('gimbalRollRotateAngle', 0),
        tag('gimbalYawRotateEnable', bool(!isTilt)),
        tag('gimbalYawRotateAngle', isTilt ? 0 : (p.angle ?? 0)),
        tag('gimbalRotateTimeEnable', 0),
        tag('gimbalRotateTime', 0),
        tag('payloadPositionIndex', 0)
      );
      break;
    }

    case 'zoom':
      // WPML carries a focal length; §7 shows focalLength with isUseFocalFactor 0.
      params.push(
        tag('focalLength', Number(((p.zoomRatio ?? 5) * 24).toFixed(1))),
        tag('isUseFocalFactor', 0),
        tag('payloadPositionIndex', 0),
        tag('isRisky', 0)
      );
      break;

    case 'hover':
      params.push(tag('hoverTime', p.hoverTime ?? 10));
      break;

    case 'startTimedShoot':
      params.push(tag('shootType', 'time'), tag('interval', p.interval ?? 3));
      break;

    case 'startDistanceShoot':
      params.push(tag('shootType', 'distance'), tag('distance', p.interval ?? 10));
      break;

    case 'createFolder':
      params.push(tag('directoryName', p.folderName ?? ''));
      break;

    default:
      break;
  }

  // The capture actions carry the lens selection and file-name suffix.
  if (['takePhoto', 'takePhotoFixedAngle', 'startRecord', 'startTimedShoot', 'startDistanceShoot'].includes(action.action_type)) {
    params.push(tag('payloadPositionIndex', 0));
    if (p.fileSuffix) params.push(tag('fileSuffix', p.fileSuffix));
    if (!p.followRoute && p.lenses?.length) {
      params.push(tag('payloadLensIndex', p.lenses.join(',')));
    }
    params.push(tag('useGlobalPayloadLensIndex', bool(p.followRoute !== false)));
  }

  return [
    '            <wpml:action>',
    `              ${tag('actionId', index)}`,
    `              ${tag('actionActuatorFunc', func)}`,
    '              <wpml:actionActuatorFuncParam>',
    ...params.map((line) => `                ${line}`),
    '              </wpml:actionActuatorFuncParam>',
    '            </wpml:action>',
  ].join('\n');
}

/** One `Placemark` — a waypoint with its heading, turn and action parameters. */
function placemarkXml(waypoint, index, settings) {
  // Smart Capture (startIntelligentDetection/stopIntelligentDetection) has no
  // verified WPML actuator function — see UNVERIFIED_WPML_ACTIONS. Rather than
  // guess at one, those actions stay editable in the app's own data but are
  // left out of the exported .kmz entirely.
  const actions = (waypoint.actions ?? []).filter(
    (action) => !UNVERIFIED_WPML_ACTIONS.includes(action.action_type)
  );

  const heading = [
    '        <wpml:waypointHeadingParam>',
    `          ${tag('waypointHeadingMode', waypoint.heading_mode ?? 'followWayline')}`,
    `          ${tag('waypointHeadingAngle', Math.round(waypoint.heading_angle ?? 0))}`,
    `          ${tag('waypointPoiPoint', point(waypoint.poi_lat ?? 0, waypoint.poi_lng ?? 0, waypoint.poi_alt ?? 0))}`,
    `          ${tag('waypointHeadingPathMode', waypoint.heading_path_mode ?? 'followBadArc')}`,
    `          ${tag('waypointHeadingPoiIndex', 0)}`,
    '        </wpml:waypointHeadingParam>',
  ].join('\n');

  const turn = [
    '        <wpml:waypointTurnParam>',
    `          ${tag('waypointTurnMode', waypoint.turn_mode ?? settings.turnMode ?? 'toPointAndStopWithDiscontinuityCurvature')}`,
    `          ${tag('waypointTurnDampingDist', waypoint.turn_damping_dist ?? 0.2)}`,
    '        </wpml:waypointTurnParam>',
  ].join('\n');

  const actionGroup = actions.length
    ? [
        '        <wpml:actionGroup>',
        `          ${tag('actionGroupId', index)}`,
        `          ${tag('actionGroupStartIndex', index)}`,
        `          ${tag('actionGroupEndIndex', index)}`,
        `          ${tag('actionGroupMode', 'sequence')}`,
        '          <wpml:actionTrigger>',
        `            ${tag('actionTriggerType', 'reachPoint')}`,
        '          </wpml:actionTrigger>',
        ...actions.map((action, i) => actionXml(action, i)),
        '        </wpml:actionGroup>',
      ].join('\n')
    : null;

  return [
    '      <Placemark>',
    '        <Point>',
    `          <coordinates>${Number(waypoint.lng).toFixed(8)},${Number(waypoint.lat).toFixed(8)}</coordinates>`,
    '        </Point>',
    `        ${tag('index', index)}`,
    waypoint.ellipsoid_height != null
      ? `        ${tag('ellipsoidHeight', waypoint.ellipsoid_height)}`
      : null,
    `        ${tag('height', waypoint.height ?? settings.globalHeight ?? 100)}`,
    `        ${tag('waypointSpeed', waypoint.speed ?? settings.autoFlightSpeed ?? 10)}`,
    heading,
    turn,
    `        ${tag('useGlobalHeight', bool(waypoint.use_global_height))}`,
    `        ${tag('useGlobalSpeed', bool(waypoint.use_global_speed))}`,
    `        ${tag('useGlobalHeadingParam', bool(waypoint.use_global_heading))}`,
    `        ${tag('useGlobalTurnParam', bool(waypoint.use_global_turn))}`,
    `        ${tag('useStraightLine', bool(waypoint.use_straight_line))}`,
    actionGroup,
    '      </Placemark>',
  ]
    .filter(Boolean)
    .join('\n');
}

function folderXml(wayline, settings, { includePlacemarks }) {
  const lenses = settings.lenses ?? DEFAULT_SETTINGS.lenses;

  const head = [
    '    <Folder>',
    `      ${tag('templateType', TEMPLATE_TYPE[wayline.route_type] ?? 'waypoint')}`,
    `      ${tag('templateId', 0)}`,
    '      <wpml:waylineCoordinateSysParam>',
    `        ${tag('coordinateMode', 'WGS84')}`,
    `        ${tag('heightMode', HEIGHT_MODE_TO_WPML[settings.heightMode] ?? 'EGM96')}`,
    '      </wpml:waylineCoordinateSysParam>',
    `      ${tag('autoFlightSpeed', settings.autoFlightSpeed ?? 10)}`,
    `      ${tag('globalHeight', settings.globalHeight ?? 100)}`,
    `      ${tag('caliFlightEnable', 0)}`,
    `      ${tag('gimbalPitchMode', settings.gimbalPitchMode ?? 'manual')}`,
    '      <wpml:globalWaypointHeadingParam>',
    `        ${tag('waypointHeadingMode', settings.headingMode ?? 'followWayline')}`,
    `        ${tag('waypointHeadingAngle', settings.headingAngle ?? 0)}`,
    `        ${tag('waypointPoiPoint', point(0, 0, 0))}`,
    `        ${tag('waypointHeadingPathMode', 'followBadArc')}`,
    `        ${tag('waypointHeadingPoiIndex', 0)}`,
    '      </wpml:globalWaypointHeadingParam>',
    `      ${tag('globalWaypointTurnMode', settings.turnMode ?? 'toPointAndStopWithDiscontinuityCurvature')}`,
    `      ${tag('globalUseStraightLine', bool(settings.useStraightLine !== false))}`,
  ];

  const payloadParam = [
    '      <wpml:payloadParam>',
    `        ${tag('payloadPositionIndex', 0)}`,
    `        ${tag('focusMode', 'firstPoint')}`,
    `        ${tag('meteringMode', 'average')}`,
    `        ${tag('returnMode', 'singleReturnStrongest')}`,
    `        ${tag('samplingRate', 240000)}`,
    `        ${tag('scanningMode', 'repetitive')}`,
    `        ${tag('imageFormat', lenses.join(','))}`,
    `        ${tag('photoSize', 'default_l')}`,
    '      </wpml:payloadParam>',
  ];

  const placemarks = includePlacemarks
    ? (wayline.waypoints ?? []).map((w, i) => placemarkXml(w, i, settings))
    : [];

  return [...head, ...payloadParam, ...placemarks, '    </Folder>'].join('\n');
}

function documentXml(wayline, { includeMeta, includePlacemarks }) {
  const settings = wayline.settings ?? {};
  const now = Date.now();

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="${NAMESPACE}">`,
    '  <Document>',
    includeMeta
      ? [
          `    ${tag('author', AUTHOR)}`,
          `    ${tag('createTime', now)}`,
          `    ${tag('updateTime', now)}`,
        ].join('\n')
      : null,
    missionConfig(settings, wayline),
    folderXml(wayline, settings, { includePlacemarks }),
    '  </Document>',
    '</kml>',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Build a `.kmz` for a wayline.
 *
 * `template.kml` carries the authoring metadata; `waylines.wpml` carries the
 * executable route. Both hold the full mission config and folder, which is how
 * the captured reference file is structured.
 */
export async function buildKmz(wayline) {
  const zip = new JSZip();
  const folder = zip.folder('wpmz');
  folder.file('template.kml', documentXml(wayline, { includeMeta: true, includePlacemarks: true }));
  folder.file('waylines.wpml', documentXml(wayline, { includeMeta: false, includePlacemarks: true }));

  // Sidecar — see SIDECAR_PATH. Never read by DJI tooling, and never a
  // substitute for the WPML: everything here is also derivable from the route.
  folder.file(
    'wayline-mission-planner.json',
    JSON.stringify(
      {
        generator: AUTHOR,
        sidecarVersion: SIDECAR_VERSION,
        aircraft_series: wayline.aircraft_series,
        aircraft_model: wayline.aircraft_model,
        payload_model: wayline.payload_model ?? null,
        route_type: wayline.route_type,
      },
      null,
      2
    )
  );

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/* -------------------------------------------------------------------- parse */

const parser = new XMLParser({
  ignoreAttributes: false,
  // Strip the wpml: prefix so lookups read naturally.
  transformTagName: (name) => name.replace(/^wpml:/, ''),
  parseTagValue: false,
  trimValues: true,
});

/** Always get an array, whether the parser produced one node or many. */
const many = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const flag = (value, fallback = true) => (value == null ? fallback : String(value) === '1');

/** `lat,lng,alt` → object, tolerating missing altitude. */
function parsePoint(value) {
  if (!value) return null;
  const [lat, lng, alt] = String(value).split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, alt: Number.isFinite(alt) ? alt : 0 };
}

/** One `wpml:action` back into our action shape. */
function parseAction(node) {
  const func = node.actionActuatorFunc;
  const p = node.actionActuatorFuncParam ?? {};

  const media = () => {
    const followRoute = flag(p.useGlobalPayloadLensIndex, true);
    const lenses = p.payloadLensIndex ? String(p.payloadLensIndex).split(',').filter(Boolean) : [];
    return { fileSuffix: p.fileSuffix ?? '', followRoute, lenses };
  };

  switch (func) {
    case 'rotateYaw':
      return {
        action_type: 'rotateYaw',
        params: {
          aircraftHeading: num(p.aircraftHeading),
          aircraftPathMode: p.aircraftPathMode ?? 'counterClockwise',
        },
      };

    case 'gimbalRotate': {
      // The enable flags distinguish a tilt from a yaw.
      const isTilt = flag(p.gimbalPitchRotateEnable, false);
      return {
        action_type: isTilt ? 'gimbalTilt' : 'gimbalYaw',
        params: {
          angle: num(isTilt ? p.gimbalPitchRotateAngle : p.gimbalYawRotateAngle),
        },
      };
    }

    case 'zoom':
      return {
        action_type: 'zoom',
        params: { zoomRatio: Number((num(p.focalLength, 120) / 24).toFixed(2)) },
      };

    case 'hover':
      return { action_type: 'hover', params: { hoverTime: num(p.hoverTime, 10) } };

    case 'startTimeShoot':
      return {
        action_type: 'startTimedShoot',
        params: { ...media(), interval: num(p.interval, 3) },
      };

    case 'startDistanceShoot':
      return {
        action_type: 'startDistanceShoot',
        params: { ...media(), interval: num(p.distance ?? p.interval, 10) },
      };

    case 'stopShoot':
      return { action_type: 'stopShoot', params: {} };

    case 'startRecord':
      return { action_type: 'startRecord', params: media() };

    case 'stopRecord':
      return { action_type: 'stopRecord', params: {} };

    case 'takePhoto':
      return { action_type: 'takePhoto', params: media() };

    case 'panoShot':
      return { action_type: 'panorama', params: {} };

    case 'customDirName':
      return { action_type: 'createFolder', params: { folderName: p.directoryName ?? '' } };

    default:
      return null;
  }
}

function parsePlacemark(node, settings) {
  const coords = String(node.Point?.coordinates ?? '').split(',').map(Number);
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const heading = node.waypointHeadingParam ?? {};
  const turn = node.waypointTurnParam ?? {};
  const poi = parsePoint(heading.waypointPoiPoint) ?? { lat: 0, lng: 0, alt: 0 };

  const actions = many(node.actionGroup)
    .flatMap((group) => many(group.action))
    .map(parseAction)
    .filter(Boolean);

  const useGlobalSpeed = flag(node.useGlobalSpeed, true);
  const useGlobalHeight = flag(node.useGlobalHeight, true);

  return {
    lat,
    lng,
    height: num(node.height, settings.globalHeight ?? 100),
    ellipsoid_height: node.ellipsoidHeight != null ? num(node.ellipsoidHeight) : null,
    // A per-waypoint speed is only meaningful when it overrides the global one.
    speed: useGlobalSpeed ? null : num(node.waypointSpeed, settings.autoFlightSpeed ?? 10),
    heading_mode: heading.waypointHeadingMode ?? 'followWayline',
    heading_angle: num(heading.waypointHeadingAngle),
    heading_path_mode: heading.waypointHeadingPathMode ?? 'followBadArc',
    poi_lat: poi.lat,
    poi_lng: poi.lng,
    poi_alt: poi.alt,
    turn_mode: turn.waypointTurnMode ?? 'toPointAndStopWithDiscontinuityCurvature',
    turn_damping_dist: num(turn.waypointTurnDampingDist, 0.2),
    use_global_speed: useGlobalSpeed,
    use_global_height: useGlobalHeight,
    use_global_heading: flag(node.useGlobalHeadingParam, true),
    use_global_turn: flag(node.useGlobalTurnParam, true),
    use_straight_line: flag(node.useStraightLine, true),
    actions,
  };
}

/**
 * Parse a `.kmz` buffer into a wayline payload our API accepts.
 *
 * `waylines.wpml` is the executable route and wins where the two files differ;
 * `template.kml` is used as a fallback and for the placemarks when the wpml
 * half carries none (which is how the captured reference file is shaped).
 */
export async function parseKmz(buffer, { name } = {}) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw Object.assign(new Error('That file is not a valid .kmz archive'), { status: 400 });
  }

  const read = async (path) => {
    const entry = zip.file(path);
    return entry ? entry.async('string') : null;
  };

  const [wpmlText, templateText, sidecarText] = await Promise.all([
    read('wpmz/waylines.wpml'),
    read('wpmz/template.kml'),
    read(SIDECAR_PATH),
  ]);

  /** Our own metadata, when this file came from us. */
  let sidecar = null;
  if (sidecarText) {
    try {
      const parsed = JSON.parse(sidecarText);
      // Only trust it if it is actually ours and a version we understand.
      if (parsed?.generator === AUTHOR && parsed.sidecarVersion <= SIDECAR_VERSION) {
        sidecar = parsed;
      }
    } catch {
      // A corrupt sidecar must not fail the import; the WPML is the source of truth.
    }
  }

  if (!wpmlText && !templateText) {
    throw Object.assign(
      new Error('This .kmz contains no wpmz/waylines.wpml or wpmz/template.kml'),
      { status: 400 }
    );
  }

  const wpmlDoc = wpmlText ? parser.parse(wpmlText)?.kml?.Document : null;
  const templateDoc = templateText ? parser.parse(templateText)?.kml?.Document : null;

  const mission = wpmlDoc?.missionConfig ?? templateDoc?.missionConfig ?? {};
  // Prefer whichever Folder actually carries placemarks.
  const wpmlFolder = wpmlDoc?.Folder;
  const templateFolder = templateDoc?.Folder;
  const folder =
    (many(wpmlFolder).find((f) => f?.Placemark) ??
      many(templateFolder).find((f) => f?.Placemark) ??
      wpmlFolder ??
      templateFolder) ||
    {};

  const heightMode =
    WPML_TO_HEIGHT_MODE[folder.waylineCoordinateSysParam?.heightMode] ?? 'ASL';
  const globalHeading = folder.globalWaypointHeadingParam ?? {};

  const settings = {
    ...DEFAULT_SETTINGS,
    flyToWaylineMode: mission.flyToWaylineMode ?? DEFAULT_SETTINGS.flyToWaylineMode,
    finishAction: mission.finishAction ?? DEFAULT_SETTINGS.finishAction,
    exitOnRCLost: mission.exitOnRCLost ?? DEFAULT_SETTINGS.exitOnRCLost,
    executeRCLostAction: mission.executeRCLostAction ?? DEFAULT_SETTINGS.executeRCLostAction,
    takeOffSecurityHeight: num(mission.takeOffSecurityHeight, 20),
    takeOffRefPoint: parsePoint(mission.takeOffRefPoint),
    globalTransitionalSpeed: num(mission.globalTransitionalSpeed, 15),
    globalRTHHeight: num(mission.globalRTHHeight, 100),
    autoFlightSpeed: num(folder.autoFlightSpeed, 10),
    globalHeight: num(folder.globalHeight, 100),
    heightMode: HEIGHT_MODES.includes(heightMode) ? heightMode : 'ASL',
    gimbalPitchMode: folder.gimbalPitchMode ?? 'manual',
    headingMode: globalHeading.waypointHeadingMode ?? 'followWayline',
    headingAngle: num(globalHeading.waypointHeadingAngle),
    turnMode: folder.globalWaypointTurnMode ?? DEFAULT_SETTINGS.turnMode,
    useStraightLine: flag(folder.globalUseStraightLine, true),
    lenses: folder.payloadParam?.imageFormat
      ? String(folder.payloadParam.imageFormat).split(',').filter(Boolean)
      : DEFAULT_SETTINGS.lenses,
  };

  // Our own sidecar first, then the WPML identifiers for someone else's file.
  // The sidecar is only trusted for an aircraft that actually exists in the
  // catalogue — otherwise a stale or hand-edited file could reintroduce a model
  // this build knows nothing about.
  const sidecarModelExists =
    !!AIRCRAFT[sidecar?.aircraft_series]?.models?.[sidecar?.aircraft_model];
  const fromSidecar = sidecarModelExists
    ? { aircraft_series: sidecar.aircraft_series, aircraft_model: sidecar.aircraft_model }
    : null;
  const resolved =
    fromSidecar ??
    modelFromInfo(
      num(mission.droneInfo?.droneEnumValue),
      num(mission.droneInfo?.droneSubEnumValue)
    );
  // An unrecognised aircraft falls back rather than failing the import, and the
  // caller is told so it can surface it.
  const aircraft = resolved ?? { aircraft_series: 'M30', aircraft_model: 'M30T' };

  const templateType = folder.templateType ?? 'waypoint';
  const routeType =
    (Object.keys(TEMPLATE_TYPE).includes(sidecar?.route_type) ? sidecar.route_type : null) ??
    Object.entries(TEMPLATE_TYPE).find(([, value]) => value === templateType)?.[0] ??
    'waypoint';

  const waypoints = many(folder.Placemark)
    .map((placemark) => parsePlacemark(placemark, settings))
    .filter(Boolean);

  return {
    name: name || 'Imported route',
    description: resolved
      ? 'Imported from KMZ'
      : 'Imported from KMZ — the aircraft could not be identified from the file and has been set to the default.',
    route_type: routeType,
    ...aircraft,
    payload_model: sidecar?.payload_model ?? null,
    settings,
    waypoints,
  };
}

export { HEIGHT_MODE_TO_WPML, NAMESPACE };
