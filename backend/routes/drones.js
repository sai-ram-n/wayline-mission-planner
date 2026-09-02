import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { droneCreateSchema, droneUpdateSchema } from '../schemas.js';
import { asyncHandler, httpError, validate } from '../middleware.js';

const router = Router();

const listStmt = db.prepare('SELECT * FROM drones ORDER BY name');
const getStmt = db.prepare('SELECT * FROM drones WHERE id = ?');
const insertStmt = db.prepare(
  'INSERT INTO drones (id, name, model, series, status) VALUES (@id, @name, @model, @series, @status)'
);

router.get('/', asyncHandler((req, res) => res.json(listStmt.all())));

router.post('/', validate(droneCreateSchema), asyncHandler((req, res) => {
  const id = randomUUID();
  insertStmt.run({ id, ...req.body });
  res.status(201).json(getStmt.get(id));
}));

router.patch('/:id', validate(droneUpdateSchema), asyncHandler((req, res) => {
  const drone = getStmt.get(req.params.id);
  if (!drone) throw httpError(404, 'Drone not found');

  const next = { ...drone, ...req.body };
  db.prepare('UPDATE drones SET name = ?, status = ? WHERE id = ?')
    .run(next.name, next.status, req.params.id);
  res.json(getStmt.get(req.params.id));
}));

export default router;
