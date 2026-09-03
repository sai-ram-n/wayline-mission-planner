/**
 * Frontend-only presentation helpers.
 *
 * Domain values (enums, labels, defaults) come from /api/meta — this file only
 * maps them to icons and colours, so the two never drift.
 */
import {
  LuCamera,
  LuCameraOff,
  LuVideo,
  LuVideoOff,
  LuTimer,
  LuRuler,
  LuCircleStop,
  LuPause,
  LuRotate3D,
  LuMoveHorizontal,
  LuMoveVertical,
  LuZoomIn,
  LuPanelsTopLeft,
  LuFolderPlus,
} from 'react-icons/lu';

/** Icon per action type, used in the waypoint list and the action editor header. */
export const ACTION_ICONS = {
  takePhoto: LuCamera,
  takePhotoFixedAngle: LuCameraOff,
  startRecord: LuVideo,
  stopRecord: LuVideoOff,
  startTimedShoot: LuTimer,
  startDistanceShoot: LuRuler,
  stopShoot: LuCircleStop,
  hover: LuPause,
  rotateYaw: LuRotate3D,
  gimbalYaw: LuMoveHorizontal,
  gimbalTilt: LuMoveVertical,
  zoom: LuZoomIn,
  panorama: LuPanelsTopLeft,
  createFolder: LuFolderPlus,
};

/** Map colours. Kept here so the polyline, markers and legend agree. */
export const MAP_COLORS = {
  route: '#2d8cf0',
  routeCasing: '#101010',
  marker: '#2d8cf0',
  // Orange is the reference editor's "editing waypoint" state colour.
  markerSelected: '#ff9500',
  start: '#00ee8b',
  takeoff: '#ff9500',
  area: '#2d8cf0',
  generated: '#00ee8b',
};

/** Default map view when a mission has no waypoints yet — Hyderabad, Telangana. */
export const DEFAULT_CENTER = [17.385, 78.4867];
export const DEFAULT_ZOOM = 14;

/**
 * OpenStreetMap raster tiles. No API key required; attribution is mandatory
 * under the OSM tile usage policy and is rendered on the map.
 */
export const TILE_LAYERS = {
  street: {
    label: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  topo: {
    label: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
      'SRTM | map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
  },
};

/** Drone status pill styling. */
export const DRONE_STATUS_STYLES = {
  idle: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  flying: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  offline: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

/** Assignment status pill styling. */
export const ASSIGNMENT_STATUS_STYLES = {
  pending: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  synced: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  in_progress: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  complete: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export const ASSIGNMENT_STATUS_LABELS = {
  pending: 'Pending',
  synced: 'Synced',
  in_progress: 'In progress',
  complete: 'Complete',
  failed: 'Failed',
};

export const ROUTE_TYPE_LABELS = {
  waypoint: 'Waypoint Route',
  area: 'Area Route',
  linear: 'Linear Route',
  patrol: 'Patrol Route',
  slope: 'Slope Route',
  geometric: 'Geometric Route',
  smart3d: 'Smart 3D Capture',
};
