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
      M4D: { label: 'Matrice 4D', lenses: ['wide', 'zoom'] },
      M4TD: { label: 'Matrice 4TD', lenses: ['wide', 'zoom', 'ir'] },
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

/** The five Waypoint Type options, in the order the source dropdown lists them. */
export const TURN_MODES = [
  'coordinateTurn',
  'toPointAndStopWithDiscontinuityCurvature',
  'toPointAndPassWithContinuityCurvature',
  'toPointAndStopWithContinuityCurvature',
];
export const TURN_MODE_LABELS = {
  coordinateTurn: 'Coordinated turn. Skips waypoint',
  toPointAndStopWithDiscontinuityCurvature: 'Straight route. Aircraft stops',
  toPointAndPassWithContinuityCurvature: 'Turns before waypoint. Flies through',
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
};

/** Additional defaults for mapping routes (§8.1, §8.2). */
export const DEFAULT_MAPPING_SETTINGS = {
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
  autoFlightSpeed: 10,
  zigzag: true,
  leftExtension: 50,
  rightExtension: 50,
  cuttingDistance: 1000,
  includeCenterLine: false,
  directionMode: 'parallelToCenterLine',
};

export const ASSIGNMENT_STATUSES = ['pending', 'synced', 'in_progress', 'complete', 'failed'];

/** Forward progression used by the "advance" control on the assignments table. */
export const ASSIGNMENT_NEXT_STATUS = {
  pending: 'synced',
  synced: 'in_progress',
  in_progress: 'complete',
};

export const DRONE_STATUSES = ['idle', 'flying', 'offline'];
