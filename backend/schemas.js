/**
 * Zod request schemas. Every POST/PUT/PATCH body is validated against one of these.
 */
import { z } from 'zod';
import {
  ACTION_TYPES,
  ASSIGNMENT_STATUSES,
  DRONE_STATUSES,
  FINISH_ACTIONS,
  FLY_TO_WAYLINE_MODES,
  GIMBAL_PITCH_MODES,
  HEADING_MODES,
  HEIGHT_MODES,
  LENSES,
  PHOTO_COLLECTIONS,
  PHOTO_MODES,
  ROUTE_TYPES,
  TURN_MODES,
} from './constants.js';

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const settingsSchema = z
  .object({
    flyToWaylineMode: z.enum(FLY_TO_WAYLINE_MODES).optional(),
    finishAction: z.enum(FINISH_ACTIONS).optional(),
    exitOnRCLost: z.string().optional(),
    executeRCLostAction: z.string().optional(),
    takeOffSecurityHeight: z.number().min(1.5).max(1500).optional(),
    takeOffRefPoint: z.object({ lat, lng, alt: z.number() }).nullable().optional(),
    globalTransitionalSpeed: z.number().min(1).max(15).optional(),
    globalRTHHeight: z.number().min(20).max(1500).optional(),
    autoFlightSpeed: z.number().min(1).max(15).optional(),
    globalHeight: z.number().min(-200).max(1500).optional(),
    heightMode: z.enum(HEIGHT_MODES).optional(),
    gimbalPitchMode: z.enum(GIMBAL_PITCH_MODES).optional(),
    headingMode: z.enum(HEADING_MODES).optional(),
    headingAngle: z.number().min(-180).max(180).optional(),
    turnMode: z.enum(TURN_MODES).optional(),
    useStraightLine: z.boolean().optional(),
    lenses: z.array(z.enum(LENSES)).optional(),
    smartLowLight: z.boolean().optional(),
    syncAttitudeOnNewWaypoint: z.boolean().optional(),

    // mapping routes
    gsd: z.number().min(0.1).max(100).optional(),
    sideOverlapRate: z.number().min(0).max(95).optional(),
    forwardOverlapRate: z.number().min(0).max(95).optional(),
    margin: z.number().min(0).max(1000).optional(),
    courseAngle: z.number().min(-180).max(180).optional(),
    photoMode: z.enum(PHOTO_MODES).optional(),
    photoCollection: z.enum(PHOTO_COLLECTIONS).optional(),
    elevationOptimization: z.boolean().optional(),
    boundaryOptimization: z.boolean().optional(),
    customCameraAngle: z.boolean().optional(),
    routeStartPoint: z.enum(['start', 'end']).optional(),
    flipArea: z.boolean().optional(),
    realTimeTerrainFollow: z.boolean().optional(),
    gsdIr: z.number().min(0.1).max(100).optional(),
    gsdLinked: z.boolean().optional(),

    // linear routes
    zigzag: z.boolean().optional(),
    leftExtension: z.number().min(0).max(5000).optional(),
    rightExtension: z.number().min(0).max(5000).optional(),
    cuttingDistance: z.number().min(1).max(100000).optional(),
    includeCenterLine: z.boolean().optional(),
    directionMode: z.string().optional(),
  })
  .passthrough();

export const actionSchema = z.object({
  action_type: z.enum(ACTION_TYPES),
  params: z.record(z.any()).optional().default({}),
});

export const waypointSchema = z.object({
  lat,
  lng,
  height: z.number().min(-200).max(1500),
  ellipsoid_height: z.number().nullable().optional(),
  speed: z.number().min(1).max(15).nullable().optional(),
  heading_mode: z.enum(HEADING_MODES).optional(),
  heading_angle: z.number().min(-180).max(180).optional(),
  heading_path_mode: z.string().optional(),
  poi_lat: z.number().optional(),
  poi_lng: z.number().optional(),
  poi_alt: z.number().optional(),
  turn_mode: z.enum(TURN_MODES).optional(),
  turn_damping_dist: z.number().min(0).max(1000).optional(),
  use_global_speed: z.boolean().optional(),
  use_global_height: z.boolean().optional(),
  use_global_heading: z.boolean().optional(),
  use_global_turn: z.boolean().optional(),
  use_straight_line: z.boolean().optional(),
  actions: z.array(actionSchema).optional().default([]),
});

export const waylineCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().max(2000).optional().default(''),
  folder_id: z.string().uuid().nullable().optional(),
  route_type: z.enum(ROUTE_TYPES).optional().default('waypoint'),
  aircraft_series: z.string().min(1).optional().default('M30'),
  aircraft_model: z.string().min(1).optional().default('M30T'),
  payload_model: z.string().nullable().optional(),
  locked: z.boolean().optional().default(false),
  settings: settingsSchema.optional().default({}),
  geometry: z.any().nullable().optional(),
  waypoints: z.array(waypointSchema).optional().default([]),
});

/**
 * PUT replaces the whole wayline, so it takes the same shape as create — except
 * `locked`, which is deliberately omitted. Lock state is a separate concern and is
 * only changed through PATCH, so a routine save can never silently unlock a route.
 */
export const waylineUpdateSchema = waylineCreateSchema.omit({ locked: true });

/**
 * Partial metadata update — backs the library's Rename / Move / Lock card actions
 * without touching waypoints.
 */
export const waylinePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    folder_id: z.string().uuid().nullable().optional(),
    locked: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const folderCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parent_id: z.string().uuid().nullable().optional(),
});

export const droneCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(60),
  series: z.string().trim().min(1).max(60),
  status: z.enum(DRONE_STATUSES).optional().default('idle'),
});

export const droneUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(DRONE_STATUSES).optional(),
});

export const assignmentCreateSchema = z.object({
  wayline_id: z.string().uuid(),
  drone_ids: z.array(z.string().uuid()).min(1, 'Select at least one drone'),
});

export const assignmentUpdateSchema = z.object({
  status: z.enum(ASSIGNMENT_STATUSES),
});
