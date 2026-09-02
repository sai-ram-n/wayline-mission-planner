/**
 * SQLite connection, schema initialisation and seed data.
 *
 * The schema deliberately mirrors the WPML element names documented in
 * docs/feature-reference.md §7, so a wayline can round-trip through a .kmz
 * without losing information.
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || join(here, 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new Database(join(dataDir, 'wayline.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS folders (
    id          TEXT PRIMARY KEY,
    parent_id   TEXT REFERENCES folders(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS waylines (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    folder_id       TEXT REFERENCES folders(id) ON DELETE SET NULL,
    -- 'waypoint' | 'area' | 'linear'
    route_type      TEXT NOT NULL DEFAULT 'waypoint',
    aircraft_series TEXT NOT NULL DEFAULT 'M30',
    aircraft_model  TEXT NOT NULL DEFAULT 'M30T',
    payload_model   TEXT,
    locked          INTEGER NOT NULL DEFAULT 0,
    -- mission/route configuration, shape defined in schemas.js
    settings        TEXT NOT NULL DEFAULT '{}',
    -- GeoJSON source geometry: polygon for area routes, line for linear routes
    geometry        TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS waypoints (
    id                  TEXT PRIMARY KEY,
    wayline_id          TEXT NOT NULL REFERENCES waylines(id) ON DELETE CASCADE,
    order_index         INTEGER NOT NULL,
    lat                 REAL NOT NULL,
    lng                 REAL NOT NULL,
    height              REAL NOT NULL,
    ellipsoid_height    REAL,
    speed               REAL,
    heading_mode        TEXT NOT NULL DEFAULT 'followWayline',
    heading_angle       REAL NOT NULL DEFAULT 0,
    heading_path_mode   TEXT NOT NULL DEFAULT 'followBadArc',
    poi_lat             REAL NOT NULL DEFAULT 0,
    poi_lng             REAL NOT NULL DEFAULT 0,
    poi_alt             REAL NOT NULL DEFAULT 0,
    turn_mode           TEXT NOT NULL DEFAULT 'toPointAndStopWithDiscontinuityCurvature',
    turn_damping_dist   REAL NOT NULL DEFAULT 0.2,
    use_global_speed    INTEGER NOT NULL DEFAULT 1,
    use_global_height   INTEGER NOT NULL DEFAULT 1,
    use_global_heading  INTEGER NOT NULL DEFAULT 1,
    use_global_turn     INTEGER NOT NULL DEFAULT 1,
    use_straight_line   INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS waypoint_actions (
    id           TEXT PRIMARY KEY,
    waypoint_id  TEXT NOT NULL REFERENCES waypoints(id) ON DELETE CASCADE,
    order_index  INTEGER NOT NULL,
    action_type  TEXT NOT NULL,
    params       TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS drones (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    model   TEXT NOT NULL,
    series  TEXT NOT NULL,
    -- 'idle' | 'flying' | 'offline'
    status  TEXT NOT NULL DEFAULT 'idle'
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id          TEXT PRIMARY KEY,
    wayline_id  TEXT NOT NULL REFERENCES waylines(id) ON DELETE CASCADE,
    drone_id    TEXT NOT NULL REFERENCES drones(id) ON DELETE CASCADE,
    assigned_at TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    -- 'pending' | 'synced' | 'in_progress' | 'complete' | 'failed'
    status      TEXT NOT NULL DEFAULT 'pending'
  );

  CREATE INDEX IF NOT EXISTS idx_waypoints_wayline    ON waypoints(wayline_id, order_index);
  CREATE INDEX IF NOT EXISTS idx_actions_waypoint     ON waypoint_actions(waypoint_id, order_index);
  CREATE INDEX IF NOT EXISTS idx_assignments_wayline  ON assignments(wayline_id);
  CREATE INDEX IF NOT EXISTS idx_assignments_drone    ON assignments(drone_id);
  CREATE INDEX IF NOT EXISTS idx_waylines_folder      ON waylines(folder_id);
`);

/** Seed a default folder and a small mock fleet on first run. */
function seed() {
  const now = new Date().toISOString();

  const folderCount = db.prepare('SELECT COUNT(*) AS n FROM folders').get().n;
  if (folderCount === 0) {
    db.prepare('INSERT INTO folders (id, parent_id, name, created_at) VALUES (?, NULL, ?, ?)')
      .run(randomUUID(), 'Default Folder', now);
  }

  const droneCount = db.prepare('SELECT COUNT(*) AS n FROM drones').get().n;
  if (droneCount === 0) {
    // Matrice 30T is explicitly supported, so the mock fleet includes two.
    const fleet = [
      { name: 'Falcon 01', model: 'M30T', series: 'M30', status: 'idle' },
      { name: 'Falcon 02', model: 'M30T', series: 'M30', status: 'flying' },
      { name: 'Surveyor 01', model: 'M3TD', series: 'M3D', status: 'idle' },
      { name: 'Scout 01', model: 'M3T', series: 'MAVIC3E', status: 'offline' },
    ];
    const insert = db.prepare(
      'INSERT INTO drones (id, name, model, series, status) VALUES (@id, @name, @model, @series, @status)'
    );
    const insertMany = db.transaction((rows) => {
      for (const row of rows) insert.run({ id: randomUUID(), ...row });
    });
    insertMany(fleet);
  }
}

seed();

export default db;
