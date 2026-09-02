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
      return { zoomRatio: 5 };
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
        default:
          break;
      }
    }
  }
  return { recording, intervalShooting };
}

/**
 * Whether an action can be attached at this point, and why not if it cannot.
 *
 * The reference editor refuses these silently; we return a reason so the menu can
 * explain itself instead of appearing broken.
 */
export function actionAvailability(actionType, state, context = {}) {
  const { recording, intervalShooting } = state;

  switch (actionType) {
    case 'takePhoto':
    case 'takePhotoFixedAngle':
      // Verified: with recording active, Take Photo will not attach (§6 rule 1).
      return recording
        ? { allowed: false, reason: 'The camera is recording. Add Stop Recording first.' }
        : { allowed: true };

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

    default:
      return { allowed: true };
  }
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
