/**
 * Data access for waylines and their nested waypoints/actions.
 *
 * Nested writes are transactional: on update we delete and reinsert the
 * waypoint and action rows inside a single better-sqlite3 transaction, so a
 * wayline is never left half-written.
 */
import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { DEFAULT_SETTINGS } from './constants.js';

const nowIso = () => new Date().toISOString();
const bool = (v) => (v ? 1 : 0);

// ---------------------------------------------------------------- serialisation

function rowToWayline(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    folder_id: row.folder_id,
    route_type: row.route_type,
    aircraft_series: row.aircraft_series,
    aircraft_model: row.aircraft_model,
    payload_model: row.payload_model,
    locked: Boolean(row.locked),
    settings: { ...DEFAULT_SETTINGS, ...JSON.parse(row.settings || '{}') },
    geometry: row.geometry ? JSON.parse(row.geometry) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToWaypoint(row) {
  return {
    id: row.id,
    order_index: row.order_index,
    lat: row.lat,
    lng: row.lng,
    height: row.height,
    ellipsoid_height: row.ellipsoid_height,
    speed: row.speed,
    heading_mode: row.heading_mode,
    heading_angle: row.heading_angle,
    heading_path_mode: row.heading_path_mode,
    poi_lat: row.poi_lat,
    poi_lng: row.poi_lng,
    poi_alt: row.poi_alt,
    turn_mode: row.turn_mode,
    turn_damping_dist: row.turn_damping_dist,
    use_global_speed: Boolean(row.use_global_speed),
    use_global_height: Boolean(row.use_global_height),
    use_global_heading: Boolean(row.use_global_heading),
    use_global_turn: Boolean(row.use_global_turn),
    use_straight_line: Boolean(row.use_straight_line),
    actions: [],
  };
}

// ---------------------------------------------------------------- statements

const stmt = {
  listWaylines: db.prepare('SELECT * FROM waylines ORDER BY updated_at DESC'),
  getWayline: db.prepare('SELECT * FROM waylines WHERE id = ?'),
  countWaypoints: db.prepare('SELECT COUNT(*) AS n FROM waypoints WHERE wayline_id = ?'),
  waypointsFor: db.prepare('SELECT * FROM waypoints WHERE wayline_id = ? ORDER BY order_index'),
  actionsFor: db.prepare(`
    SELECT a.* FROM waypoint_actions a
    JOIN waypoints w ON w.id = a.waypoint_id
    WHERE w.wayline_id = ?
    ORDER BY w.order_index, a.order_index
  `),
  waypointCoords: db.prepare(
    'SELECT lat, lng FROM waypoints WHERE wayline_id = ? ORDER BY order_index'
  ),

  insertWayline: db.prepare(`
    INSERT INTO waylines (id, name, description, folder_id, route_type, aircraft_series,
                          aircraft_model, payload_model, locked, settings, geometry,
                          created_at, updated_at)
    VALUES (@id, @name, @description, @folder_id, @route_type, @aircraft_series,
            @aircraft_model, @payload_model, @locked, @settings, @geometry,
            @created_at, @updated_at)
  `),
  updateWayline: db.prepare(`
    UPDATE waylines SET
      name = @name, description = @description, folder_id = @folder_id,
      route_type = @route_type, aircraft_series = @aircraft_series,
      aircraft_model = @aircraft_model, payload_model = @payload_model,
      locked = @locked, settings = @settings, geometry = @geometry,
      updated_at = @updated_at
    WHERE id = @id
  `),
  deleteWayline: db.prepare('DELETE FROM waylines WHERE id = ?'),
  deleteWaypointsFor: db.prepare('DELETE FROM waypoints WHERE wayline_id = ?'),

  insertWaypoint: db.prepare(`
    INSERT INTO waypoints (id, wayline_id, order_index, lat, lng, height, ellipsoid_height,
                           speed, heading_mode, heading_angle, heading_path_mode,
                           poi_lat, poi_lng, poi_alt, turn_mode, turn_damping_dist,
                           use_global_speed, use_global_height, use_global_heading,
                           use_global_turn, use_straight_line)
    VALUES (@id, @wayline_id, @order_index, @lat, @lng, @height, @ellipsoid_height,
            @speed, @heading_mode, @heading_angle, @heading_path_mode,
            @poi_lat, @poi_lng, @poi_alt, @turn_mode, @turn_damping_dist,
            @use_global_speed, @use_global_height, @use_global_heading,
            @use_global_turn, @use_straight_line)
  `),
  insertAction: db.prepare(`
    INSERT INTO waypoint_actions (id, waypoint_id, order_index, action_type, params)
    VALUES (@id, @waypoint_id, @order_index, @action_type, @params)
  `),
};

// ---------------------------------------------------------------- reads

/** Summary rows for the library, including waypoint count and a coordinate path for thumbnails. */
export function listWaylines() {
  return stmt.listWaylines.all().map((row) => {
    const wayline = rowToWayline(row);
    return {
      ...wayline,
      waypoint_count: stmt.countWaypoints.get(row.id).n,
      path: stmt.waypointCoords.all(row.id).map((p) => [p.lat, p.lng]),
    };
  });
}

/** Full wayline with nested waypoints and their actions. */
export function getWayline(id) {
  const wayline = rowToWayline(stmt.getWayline.get(id));
  if (!wayline) return null;

  const waypoints = stmt.waypointsFor.all(id).map(rowToWaypoint);
  const byId = new Map(waypoints.map((w) => [w.id, w]));

  for (const action of stmt.actionsFor.all(id)) {
    byId.get(action.waypoint_id)?.actions.push({
      id: action.id,
      order_index: action.order_index,
      action_type: action.action_type,
      params: JSON.parse(action.params || '{}'),
    });
  }

  return { ...wayline, waypoints };
}

// ---------------------------------------------------------------- writes

/** Insert the waypoint and action rows for a wayline. Caller must be in a transaction. */
function writeWaypoints(waylineId, waypoints) {
  waypoints.forEach((wp, index) => {
    const waypointId = randomUUID();
    stmt.insertWaypoint.run({
      id: waypointId,
      wayline_id: waylineId,
      order_index: index,
      lat: wp.lat,
      lng: wp.lng,
      height: wp.height,
      ellipsoid_height: wp.ellipsoid_height ?? null,
      speed: wp.speed ?? null,
      heading_mode: wp.heading_mode ?? 'followWayline',
      heading_angle: wp.heading_angle ?? 0,
      heading_path_mode: wp.heading_path_mode ?? 'followBadArc',
      poi_lat: wp.poi_lat ?? 0,
      poi_lng: wp.poi_lng ?? 0,
      poi_alt: wp.poi_alt ?? 0,
      turn_mode: wp.turn_mode ?? 'toPointAndStopWithDiscontinuityCurvature',
      turn_damping_dist: wp.turn_damping_dist ?? 0.2,
      use_global_speed: bool(wp.use_global_speed ?? true),
      use_global_height: bool(wp.use_global_height ?? true),
      use_global_heading: bool(wp.use_global_heading ?? true),
      use_global_turn: bool(wp.use_global_turn ?? true),
      use_straight_line: bool(wp.use_straight_line ?? true),
    });

    (wp.actions ?? []).forEach((action, actionIndex) => {
      stmt.insertAction.run({
        id: randomUUID(),
        waypoint_id: waypointId,
        order_index: actionIndex,
        action_type: action.action_type,
        params: JSON.stringify(action.params ?? {}),
      });
    });
  });
}

export const createWayline = db.transaction((input) => {
  const id = randomUUID();
  const now = nowIso();

  stmt.insertWayline.run({
    id,
    name: input.name,
    description: input.description ?? '',
    folder_id: input.folder_id ?? null,
    route_type: input.route_type ?? 'waypoint',
    aircraft_series: input.aircraft_series ?? 'M30',
    aircraft_model: input.aircraft_model ?? 'M30T',
    payload_model: input.payload_model ?? null,
    locked: bool(input.locked),
    settings: JSON.stringify(input.settings ?? {}),
    geometry: input.geometry ? JSON.stringify(input.geometry) : null,
    created_at: now,
    updated_at: now,
  });

  writeWaypoints(id, input.waypoints ?? []);
  return id;
});

export const updateWayline = db.transaction((id, input) => {
  stmt.updateWayline.run({
    id,
    name: input.name,
    description: input.description ?? '',
    folder_id: input.folder_id ?? null,
    route_type: input.route_type ?? 'waypoint',
    aircraft_series: input.aircraft_series ?? 'M30',
    aircraft_model: input.aircraft_model ?? 'M30T',
    payload_model: input.payload_model ?? null,
    locked: bool(input.locked),
    settings: JSON.stringify(input.settings ?? {}),
    geometry: input.geometry ? JSON.stringify(input.geometry) : null,
    updated_at: nowIso(),
  });

  // Actions cascade from waypoints, so deleting the waypoints clears both.
  stmt.deleteWaypointsFor.run(id);
  writeWaypoints(id, input.waypoints ?? []);
});

/**
 * Partial metadata update (name / description / folder / lock). Only the keys
 * actually supplied are written, so this never disturbs the route contents.
 */
export function patchWayline(id, fields) {
  const columns = [];
  const values = {};

  for (const key of ['name', 'description', 'folder_id']) {
    if (fields[key] !== undefined) {
      columns.push(`${key} = @${key}`);
      values[key] = fields[key];
    }
  }
  if (fields.locked !== undefined) {
    columns.push('locked = @locked');
    values.locked = bool(fields.locked);
  }
  if (!columns.length) return;

  columns.push('updated_at = @updated_at');
  values.updated_at = nowIso();
  values.id = id;

  db.prepare(`UPDATE waylines SET ${columns.join(', ')} WHERE id = @id`).run(values);
}

export function deleteWayline(id) {
  return stmt.deleteWayline.run(id).changes > 0;
}

/** Deep-copy a wayline, including every waypoint and action. */
export const duplicateWayline = db.transaction((id, name) => {
  const source = getWayline(id);
  if (!source) return null;
  return createWayline({
    ...source,
    name: name || `${source.name} (copy)`,
    locked: false,
  });
});

export function waylineExists(id) {
  return Boolean(stmt.getWayline.get(id));
}
