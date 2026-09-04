/**
 * Domain enums and aircraft catalogue.
 *
 * Values come from docs/feature-reference.md — §1 (route types, aircraft,
 * compatibility), §5 (global settings), §6 (actions) and §7 (WPML mapping).
 * Keep this file and the frontend's lib/constants.js in step.
 */

export const ROUTE_TYPES = ['waypoint', 'area', 'linear'];

/** Route types documented but not implemented in this build (feature-reference §1). */
export const UNSUPPORTED_ROUTE_TYPES = ['patrol', 'slope', 'geometric', 'smart3d'];

/** WPML templateType for each route type we support. */
export const TEMPLATE_TYPE = {
  waypoint: 'waypoint',
  area: 'mapping2d',
  linear: 'mappingStrip',
};

/**
 * Aircraft catalogue. droneEnumValue / droneSubEnumValue are the WPML identifiers;
 * only the Matrice 30T pair (67 / 1) was observed directly in an exported file, so
 * the others are marked unverified and the exporter falls back safely.
 */
export const AIRCRAFT = {
  M30: {
    label: 'Matrice 30 Series',
    droneEnumValue: 67,
    verified: true,
    models: {
      M30: { label: 'Matrice 30', droneSubEnumValue: 0, lenses: ['wide', 'zoom', 'ir'] },
      M30T: {
        label: 'Matrice 30 T',
        droneSubEnumValue: 1,
        verified: true,
        lenses: ['wide', 'zoom', 'ir'],
        mappingLenses: ['wide', 'ir'], // §8.1: no zoom on area routes
        smartLowLight: true,
        payload: { payloadEnumValue: 53, payloadSubEnumValue: 2 },
      },
    },
  },
  MAVIC3E: {
    label: 'Mavic 3 Enterprise Series',
    models: {
      M3E: { label: 'Mavic 3E', lenses: ['visible'] },
      M3T: { label: 'Mavic 3T', lenses: ['visible', 'ir'] },
      M3TA: { label: 'Mavic 3TA', lenses: ['visible', 'ir'] },
    },
  },
  M3D: {
    label: 'Matrice 3D series',
    models: {
      M3D: { label: 'Matrice 3D', lenses: ['visible'] },
      M3TD: { label: 'Matrice 3TD', lenses: ['visible', 'ir'] },
    },
  },
  M4E: {
    label: 'Matrice 4 Enterprise Series',
    accessories: ['AS1 Speaker', 'AL1 SpotLight'],
    models: {
      M4E: { label: 'Matrice 4E', lenses: ['wide', 'zoom'] },
      M4T: { label: 'Matrice 4T', lenses: ['wide', 'zoom', 'ir'] },
    },
  },
  M4D: {
    label: 'Matrice 4D Series',
    accessories: ['AS1 Speaker', 'AL1 SpotLight'],
    models: {
      M4D: {
        label: 'Matrice 4D',
        lenses: ['visible'],
        // DJI-Matrice-4D-audit.md §1/§7/§12, observed directly on the Matrice 4D
        // test route (not just its 4TD sibling below): Smart Low-Light and Bypass
        // Obstacle are present, Camera Zoom actions default to 7X, and only
        // Gimbal Tilt is offered — no separate Gimbal Yaw control.
        smartLowLight: true,
        defaultZoomRatio: 7,
        excludedActions: ['gimbalYaw'],
        bypassObstacle: true,
      },
      M4TD: {
        label: 'Matrice 4TD',
        verified: true,
        // §9b: the Camera Settings chips read Visible / IR — there is no Zoom
        // chip, even though the preview offers a 7X zoom lens.
        lenses: ['visible', 'ir'],
        smartLowLight: true,
        defaultZoomRatio: 1,
        // No Gimbal Yaw in this aircraft's action list.
        excludedActions: ['gimbalYaw'],
        bypassObstacle: true,
      },
    },
  },
  M400: {
    label: 'Matrice 400',
    payloadBays: 4,
    models: {
      M400: { label: 'Matrice 400', lenses: ['wide', 'zoom', 'ir'] },
    },
    payloads: {
      'H30 Series': ['H30', 'H30T'],
      P1: ['P1-24mm', 'P1-35mm', 'P1-50mm'],
      LiDAR: ['L2', 'L3'],
      PSDK: ['V1 Speaker', 'S1 SpotLight'],
    },
  },
};

/** Route type -> aircraft series allowed. Matrix from feature-reference §1. */
export const ROUTE_TYPE_AIRCRAFT = {
  waypoint: ['M30', 'MAVIC3E', 'M3D', 'M4E', 'M4D', 'M400'],
  area: ['M30', 'MAVIC3E', 'M3D', 'M4E', 'M4D', 'M400'],
  linear: ['MAVIC3E', 'M3D', 'M4E', 'M4D', 'M400'],
  // documented but not built:
  slope: ['MAVIC3E', 'M3D', 'M4E', 'M4D', 'M400'],
  geometric: ['MAVIC3E', 'M3D', 'M4E', 'M4D', 'M400'],
  smart3d: ['M4E', 'M4D', 'M400'],
  patrol: ['M4E', 'M4D', 'M400'],
};

// ---------------------------------------------------------------- global settings

export const FINISH_ACTIONS = ['goHome', 'autoLand', 'gotoFirstWaypoint', 'noAction'];
export const FINISH_ACTION_LABELS = {
  goHome: 'Return to Home',
  gotoFirstWaypoint: 'Return to Start Point and Hover',
  noAction: 'Exit Task',
  autoLand: 'Land',
};

export const FLY_TO_WAYLINE_MODES = ['safely', 'pointToPoint'];
export const FLY_TO_WAYLINE_MODE_LABELS = {
  pointToPoint: 'Direct Ascent',
  safely: 'Safe Takeoff',
};

export const HEIGHT_MODES = ['ASL', 'ALT', 'AGL'];

export const HEADING_MODES = ['followWayline', 'manually', 'fixed', 'towardPOI'];
export const HEADING_MODE_LABELS = {
  followWayline: 'Along Route',
  manually: 'Manual',
  fixed: 'Lock Yaw Axis',
  towardPOI: 'Point of Interest',
};

export const GIMBAL_PITCH_MODES = ['manual', 'usePointSetting'];
export const GIMBAL_PITCH_MODE_LABELS = {
  manual: 'Manual',
  usePointSetting: 'For Each Waypoint',
};

/**
 * Waypoint Type options, in the order the source dropdown lists them.
 *
 * The reference dropdown shows five labels but the WPML enum has four values:
 * "Turns before waypoint. Flies through" and "Curved route. Aircraft continues"
 * both serialise to `toPointAndPassWithContinuityCurvature` (feature-reference §7).
 * The combined label below keeps both wordings visible rather than dropping one.
 */
export const TURN_MODES = [
  'coordinateTurn',
  'toPointAndStopWithDiscontinuityCurvature',
  'toPointAndPassWithContinuityCurvature',
  'toPointAndStopWithContinuityCurvature',
];
export const TURN_MODE_LABELS = {
  coordinateTurn: 'Coordinated turn. Skips waypoint',
  toPointAndStopWithDiscontinuityCurvature: 'Straight route. Aircraft stops',
  toPointAndPassWithContinuityCurvature:
    'Turns before waypoint. Flies through / Curved route. Aircraft continues',
  toPointAndStopWithContinuityCurvature: 'Curved route. Aircraft stops',
};

export const LENSES = ['wide', 'zoom', 'ir', 'visible'];
export const PHOTO_MODES = ['timeInterval', 'distanceInterval'];
export const PHOTO_COLLECTIONS = ['ortho', 'oblique'];

// ---------------------------------------------------------------- actions

/**
 * The action catalogue from feature-reference §6, with the WPML actuator function
 * each maps to and whether it takes a file-name/lens block.
 */
export const ACTION_TYPES = [
  'takePhoto',
  'takePhotoFixedAngle',
  'startRecord',
  'stopRecord',
  'startTimedShoot',
  'startDistanceShoot',
  'stopShoot',
  'hover',
  'rotateYaw',
  'gimbalYaw',
  'gimbalTilt',
  'zoom',
  'panorama',
  'createFolder',
];

export const ACTION_LABELS = {
  takePhoto: 'Take Photo',
  takePhotoFixedAngle: 'Take Photo (Fixed Angle)',
  startRecord: 'Start Recording',
  stopRecord: 'Stop Recording',
  startTimedShoot: 'Start Timed Interval Shot',
  startDistanceShoot: 'Start Distance Interval Shot',
  stopShoot: 'End Interval Shot',
  hover: 'Hover',
  rotateYaw: 'Aircraft Yaw',
  gimbalYaw: 'Gimbal Yaw',
  gimbalTilt: 'Gimbal Tilt',
  zoom: 'Camera Zoom',
  panorama: 'Pano',
  createFolder: 'Create Folder',
};

/** WPML actionActuatorFunc for each action type. */
export const ACTION_ACTUATOR = {
  takePhoto: 'takePhoto',
  takePhotoFixedAngle: 'takePhoto',
  startRecord: 'startRecord',
  stopRecord: 'stopRecord',
  startTimedShoot: 'startTimeShoot',
  startDistanceShoot: 'startDistanceShoot',
  stopShoot: 'stopShoot',
  hover: 'hover',
  rotateYaw: 'rotateYaw',
  gimbalYaw: 'gimbalRotate',
  gimbalTilt: 'gimbalRotate',
  zoom: 'zoom',
  panorama: 'panoShot',
  createFolder: 'customDirName',
};

/** Actions that carry the file-name + lens chips + Follow Route block (§6). */
export const ACTIONS_WITH_MEDIA_PARAMS = [
  'takePhoto',
  'takePhotoFixedAngle',
  'startRecord',
  'startTimedShoot',
  'startDistanceShoot',
];

/** Actions with no parameters at all (§6). */
export const ACTIONS_WITHOUT_PARAMS = ['stopRecord', 'stopShoot', 'panorama'];

/** Actions that count toward the "Photos" statistic. */
export const PHOTO_ACTIONS = ['takePhoto', 'takePhotoFixedAngle', 'panorama'];

// ---------------------------------------------------------------- defaults

/** Global settings defaults, exactly as observed on a Matrice 30T waypoint route (§5). */
export const DEFAULT_SETTINGS = {
  flyToWaylineMode: 'pointToPoint',
  finishAction: 'goHome',
  exitOnRCLost: 'goContinue',
  executeRCLostAction: 'goBack',
  takeOffSecurityHeight: 20,
  takeOffRefPoint: null,
  globalTransitionalSpeed: 15,
  globalRTHHeight: 100,
  autoFlightSpeed: 10,
  globalHeight: 100,
  heightMode: 'ASL',
  gimbalPitchMode: 'manual',
  headingMode: 'followWayline',
  headingAngle: 0,
  turnMode: 'toPointAndStopWithDiscontinuityCurvature',
  useStraightLine: true,
  lenses: ['wide', 'zoom', 'ir'],
  smartLowLight: false,
  syncAttitudeOnNewWaypoint: true,
  // Editor settings panel, m4td-waypoint-editor.md §4.
  minAltitudeAlertAGL: 20,
  // Advanced Settings, M4-series only (§3).
  bypassObstacle: false,
};

/** Additional defaults for mapping routes (§8.1, §8.2). */
export const DEFAULT_MAPPING_SETTINGS = {
  // §8.1: an area route defaults to AGL and 15 m/s, unlike a waypoint route.
  heightMode: 'AGL',
  autoFlightSpeed: 15,
  gsd: 5,
  sideOverlapRate: 70,
  forwardOverlapRate: 80,
  margin: 0,
  courseAngle: 0,
  photoMode: 'timeInterval',
  photoCollection: 'ortho',
  elevationOptimization: true,
  boundaryOptimization: false,
  customCameraAngle: false,
};

export const DEFAULT_LINEAR_SETTINGS = {
  ...DEFAULT_MAPPING_SETTINGS,
  // §8.2: a linear route defaults back to 10 m/s.
  autoFlightSpeed: 10,
  zigzag: true,
  leftExtension: 50,
  rightExtension: 50,
  cuttingDistance: 1000,
  includeCenterLine: false,
  directionMode: 'parallelToCenterLine',
};

/**
 * Sensor resolutions used to turn a GSD into a ground footprint, and from there
 * into line spacing and photo spacing for mapping routes.
 *
 * NOT from the live-site exploration — feature-reference §8 records the GSD and
 * overlap defaults but not the sensor specifications behind them. These are the
 * published still-image resolutions for each aircraft's mapping camera, used as a
 * documented engineering assumption. Our generated distance and photo counts are
 * therefore our own estimates and are not expected to match the reference
 * editor's numbers exactly.
 */
export const MAPPING_SENSORS = {
  M30: { width: 4000, height: 3000 },
  M30T: { width: 4000, height: 3000 },
  M3E: { width: 5280, height: 3956 },
  M3T: { width: 4000, height: 3000 },
  M3TA: { width: 4000, height: 3000 },
  M3D: { width: 5280, height: 3956 },
  M3TD: { width: 4000, height: 3000 },
  M4E: { width: 5280, height: 3956 },
  M4T: { width: 4000, height: 3000 },
  M4D: { width: 5280, height: 3956 },
  M4TD: { width: 4000, height: 3000 },
  M400: { width: 5280, height: 3956 },
};

/** Fallback when a model is not listed above. */
export const DEFAULT_MAPPING_SENSOR = { width: 4000, height: 3000 };

export const ASSIGNMENT_STATUSES = ['pending', 'synced', 'in_progress', 'complete', 'failed'];

/** Forward progression used by the "advance" control on the assignments table. */
export const ASSIGNMENT_NEXT_STATUS = {
  pending: 'synced',
  synced: 'in_progress',
  in_progress: 'complete',
};

export const DRONE_STATUSES = ['idle', 'flying', 'offline'];
