import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { assignmentCreateSchema, assignmentUpdateSchema } from '../schemas.js';
import { asyncHandler, httpError, validate } from '../middleware.js';

const router = Router();

/** Assignments joined with the wayline and drone they reference, for the status table. */
const listStmt = db.prepare(`
  SELECT a.*,
         w.name  AS wayline_name,
         w.route_type,
         d.name  AS drone_name,
         d.model AS drone_model,
         d.status AS drone_status
  FROM assignments a
  JOIN waylines w ON w.id = a.wayline_id
  JOIN drones   d ON d.id = a.drone_id
  ORDER BY a.assigned_at DESC
`);
const getStmt = db.prepare('SELECT * FROM assignments WHERE id = ?');
const insertStmt = db.prepare(`
  INSERT INTO assignments (id, wayline_id, drone_id, assigned_at, updated_at, status)
  VALUES (@id, @wayline_id, @drone_id, @assigned_at, @updated_at, 'pending')
`);

router.get('/', asyncHandler((req, res) => res.json(listStmt.all())));

router.post('/', validate(assignmentCreateSchema), asyncHandler((req, res) => {
  const { wayline_id, drone_ids } = req.body;

  if (!db.prepare('SELECT 1 FROM waylines WHERE id = ?').get(wayline_id)) {
    throw httpError(404, 'Wayline not found');
  }
  const known = new Set(db.prepare('SELECT id FROM drones').all().map((d) => d.id));
  const unknown = drone_ids.filter((id) => !known.has(id));
  if (unknown.length) throw httpError(404, `Unknown drone(s): ${unknown.join(', ')}`);

  const now = new Date().toISOString();
  const createMany = db.transaction((ids) =>
    ids.map((drone_id) => {
      const id = randomUUID();
      insertStmt.run({ id, wayline_id, drone_id, assigned_at: now, updated_at: now });
      return id;
    })
  );

  const created = new Set(createMany(drone_ids));
  res.status(201).json(listStmt.all().filter((a) => created.has(a.id)));
}));

router.patch('/:id', validate(assignmentUpdateSchema), asyncHandler((req, res) => {
  if (!getStmt.get(req.params.id)) throw httpError(404, 'Assignment not found');

  db.prepare('UPDATE assignments SET status = ?, updated_at = ? WHERE id = ?')
    .run(req.body.status, new Date().toISOString(), req.params.id);

  res.json(listStmt.all().find((a) => a.id === req.params.id));
}));

router.delete('/:id', asyncHandler((req, res) => {
  const result = db.prepare('DELETE FROM assignments WHERE id = ?').run(req.params.id);
  if (!result.changes) throw httpError(404, 'Assignment not found');
  res.status(204).end();
}));

export default router;
