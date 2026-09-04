/**
 * The waypoint-action model: defaults, menu ordering, and the camera state machine
 * that decides which actions may be attached at a given point in the route.
 *
 * Everything here comes from docs/feature-reference.md §6 — the action catalogue,
 * the verified parameter editors, and the behavioural rules observed on the live
 * editor. Action *labels* and *types* still come from /api/meta so the two never
 * drift; this file only adds the editing behaviour around them.
 */

/**
 * Actions offered directly on the map strip, in the observed order.
 * "Record Current Attitude" is handled separately — it re-captures the four
 * attitude actions rather than adding one action.
 */
export const QUICK_ACTIONS = ['takePhotoFixedAngle', 'panorama'];

/** The "More" fly-out, in the order the reference lists its twelve entries. */
export const ACTION_MENU = [
  'startRecord',
  'stopRecord',
  'startTimedShoot',
  'startDistanceShoot',
  'stopShoot',
  'hover',
  'rotateYaw',
  'gimbalYaw',
  'gimbalTilt',
  'takePhoto',
  'zoom',
  'createFolder',
  // Smart Capture (BETA), confirmed as a paired start/stop action on the M4D
  // test route (DJI-Matrice-4D-audit.md §8/§9). No verified WPML export exists
  // for it — see backend UNVERIFIED_WPML_ACTIONS — so it is editable here but
  // excluded from the .kmz.
  'startIntelligentDetection',
  'stopIntelligentDetection',
];

/** The four actions written by "synchronize attitude on new waypoint" (§4). */
export const ATTITUDE_ACTIONS = ['rotateYaw', 'gimbalYaw', 'gimbalTilt', 'zoom'];

/**
 * File-name templates shown in the media actions. The placeholders are filled by
 * the aircraft at capture time, so they stay literal in the editor; only the
 * suffix is user-editable, which is what the pencil control edits.
 */
export const FILENAME_TEMPLATES = {
  takePhoto: 'DJI_YYYYMMDDhhmm_XXX_',
  takePhotoFixedAngle: 'DJI_YYYYMMDDhhmmss_XXXX_',
  startRecord: 'DJI_YYYYMMDDhhmm_XXX_',
  startTimedShoot: 'DJI_YYYYMMDDhhmm_XXX_',
  startDistanceShoot: 'DJI_YYYYMMDDhhmm_XXX_',
  createFolder: 'DJI_YYYYMMDDhhmm_XXX_',
};

/** Default parameters for a newly attached action (§6 "Verified parameter editors"). */
export function defaultParams(actionType, settings = {}) {
  const media = {
    fileSuffix: '',
    followRoute: true,
    lenses: [...(settings.lenses ?? [])],
  };
  switch (actionType) {
    case 'rotateYaw':
      return { aircraftHeading: 0, aircraftPathMode: 'counterClockwise' };
    case 'gimbalYaw':
    case 'gimbalTilt':
      return { angle: 0 };
    case 'zoom':
      // M30T defaults to 5x, M4TD to 1x (§9b), so the caller passes the model's.
      return { zoomRatio: settings.defaultZoomRatio ?? 5 };
    case 'hover':
      return { hoverTime: 10 };
    case 'startTimedShoot':
      return { ...media, interval: 3 };
    case 'startDistanceShoot':
      return { ...media, interval: 10 };
    case 'takePhoto':
    case 'takePhotoFixedAngle':
    case 'startRecord':
      return media;
    case 'createFolder':
      return { folderName: '' };
    // Smart Capture (BETA) — parameter shape from docs/feature-reference.md
    // §8.3 (the same source project's Patrol Route exploration; this app's own
    // established reference for what this control panel looks like). Exact
    // WPML export is unverified — see UNVERIFIED_WPML_ACTIONS in the backend.
    case 'startIntelligentDetection':
      return {
        subjects: {
          people: { enabled: true, count: 1 },
          vehicles: { enabled: false, count: 1 },
          boats: { enabled: false, count: 1 },
        },
        confidenceLevel: 55,
        alertInterval: 2,
        camera: 'wide',
        photoStorage: [...(settings.lenses ?? [])],
      };
    default:
      return {};
  }
}

/**
 * Camera state as it would be when the aircraft reaches a given point in the route.
 *
 * Walks every action from the start of the mission up to (but not including) the
 * given position, because recording and interval capture persist across waypoints —
 * that is what makes Take Photo refuse to attach several waypoints after a
 * Start Recording (§6 rule 1).
 */
export function cameraStateAt(waypoints = [], waypointIndex = 0, actionIndex = Infinity) {
  let recording = false;
  let intervalShooting = false;
  let detecting = false;

  for (let i = 0; i <= waypointIndex && i < waypoints.length; i += 1) {
    const actions = waypoints[i].actions ?? [];
    const limit = i === waypointIndex ? Math.min(actionIndex, actions.length) : actions.length;
    for (let j = 0; j < limit; j += 1) {
      switch (actions[j].action_type) {
        case 'startRecord':
          recording = true;
          break;
        case 'stopRecord':
          recording = false;
          break;
        case 'startTimedShoot':
        case 'startDistanceShoot':
          intervalShooting = true;
          break;
        case 'stopShoot':
          intervalShooting = false;
          break;
        case 'startIntelligentDetection':
          detecting = true;
          break;
        case 'stopIntelligentDetection':
          detecting = false;
          break;
        default:
          break;
      }
    }
  }
  return { recording, intervalShooting, detecting };
}

/**
 * Whether an action can be attached at this point, and why not if it cannot.
 *
 * The reference editor refuses these silently; we return a reason so the menu can
 * explain itself instead of appearing broken.
 */
export function actionAvailability(actionType, state, context = {}) {
  const { recording, intervalShooting, detecting } = state;

  switch (actionType) {
    case 'takePhoto':
    case 'takePhotoFixedAngle':
      // Verified: with recording active, Take Photo will not attach (§6 rule 1).
      if (recording) {
        return { allowed: false, reason: 'The camera is recording. Add Stop Recording first.' };
      }
      // Observed again on the M4TD (§9b): a running interval shot blocks it too.
      if (intervalShooting) {
        return {
          allowed: false,
          reason: 'An interval shot is running. Add End Interval Shot first.',
        };
      }
      return { allowed: true };

    case 'startRecord':
      return recording
        ? { allowed: false, reason: 'The camera is already recording.' }
        : { allowed: true };

    case 'stopRecord':
      return recording
        ? { allowed: true }
        : { allowed: false, reason: 'The camera is not recording.' };

    case 'startTimedShoot':
      return intervalShooting
        ? { allowed: false, reason: 'An interval shot is already running.' }
        : { allowed: true };

    case 'startDistanceShoot':
      // Observed: this would not attach to a Matrice 30 waypoint route across
      // repeated attempts (§6). Distance interval remains available on mapping
      // routes via Photo Mode.
      if (context.routeType === 'waypoint' && context.aircraftSeries === 'M30') {
        return {
          allowed: false,
          reason: 'Not supported on waypoint routes for this aircraft. Use a timed interval shot.',
        };
      }
      return intervalShooting
        ? { allowed: false, reason: 'An interval shot is already running.' }
        : { allowed: true };

    case 'stopShoot':
      return intervalShooting
        ? { allowed: true }
        : { allowed: false, reason: 'No interval shot is running.' };

    case 'startIntelligentDetection':
      return detecting
        ? { allowed: false, reason: 'Intelligent Detection is already running.' }
        : { allowed: true };

    case 'stopIntelligentDetection':
      return detecting
        ? { allowed: true }
        : { allowed: false, reason: 'Intelligent Detection is not running.' };

    default:
      return { allowed: true };
  }
}

/**
 * The action menu for a given aircraft.
 *
 * Not every model offers every action: the Matrice 4TD has no Gimbal Yaw at all
 * (feature-reference §9b), so it must not appear in its menu.
 */
export function actionMenuFor(meta, series, model) {
  const excluded = meta?.aircraft?.[series]?.models?.[model]?.excludedActions ?? [];
  if (!excluded.length) return ACTION_MENU;
  return ACTION_MENU.filter((type) => !excluded.includes(type));
}

/** The attitude actions this aircraft captures, minus any it does not support. */
export function attitudeActionsFor(meta, series, model) {
  const excluded = meta?.aircraft?.[series]?.models?.[model]?.excludedActions ?? [];
  return ATTITUDE_ACTIONS.filter((type) => !excluded.includes(type));
}

/**
 * Lenses a given aircraft model offers, from the /api/meta catalogue.
 * Mapping routes expose a reduced set on some models (§8.1).
 */
export function lensesFor(meta, series, model, routeType = 'waypoint') {
  const entry = meta?.aircraft?.[series]?.models?.[model];
  if (!entry) return [];
  if (routeType !== 'waypoint' && entry.mappingLenses) return entry.mappingLenses;
  return entry.lenses ?? [];
}

export const LENS_LABELS = {
  wide: 'WIDE',
  zoom: 'ZOOM',
  ir: 'IR',
  visible: 'VISIBLE',
};
