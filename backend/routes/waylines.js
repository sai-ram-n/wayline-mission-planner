import { Router } from 'express';
import {
  createWayline,
  deleteWayline,
  duplicateWayline,
  getWayline,
  listWaylines,
  patchWayline,
  updateWayline,
} from '../repository.js';
import {
  waylineCreateSchema,
  waylinePatchSchema,
  waylineUpdateSchema,
} from '../schemas.js';
import { asyncHandler, httpError, validate } from '../middleware.js';

const router = Router();

router.get('/', asyncHandler((req, res) => {
  let items = listWaylines();

  const { q, model, series, route_type, sort } = req.query;
  if (q) {
    const needle = String(q).toLowerCase();
    items = items.filter(
      (w) =>
        w.name.toLowerCase().includes(needle) ||
        w.description.toLowerCase().includes(needle)
    );
  }
  if (model) items = items.filter((w) => w.aircraft_model === model);
  if (series) items = items.filter((w) => w.aircraft_series === series);
  if (route_type) items = items.filter((w) => w.route_type === route_type);
  if (sort === 'oldest') items = [...items].reverse();

  res.json(items);
}));

router.get('/:id', asyncHandler((req, res) => {
  const wayline = getWayline(req.params.id);
  if (!wayline) throw httpError(404, 'Wayline not found');
  res.json(wayline);
}));

router.post('/', validate(waylineCreateSchema), asyncHandler((req, res) => {
  const id = createWayline(req.body);
  res.status(201).json(getWayline(id));
}));

router.put('/:id', validate(waylineUpdateSchema), asyncHandler((req, res) => {
  const existing = getWayline(req.params.id);
  if (!existing) throw httpError(404, 'Wayline not found');
  if (existing.locked) throw httpError(409, 'This wayline is locked. Unlock it before editing.');

  // waylineUpdateSchema omits `locked`, so a save always preserves the current state.
  updateWayline(req.params.id, { ...req.body, locked: existing.locked });
  res.json(getWayline(req.params.id));
}));

/** Rename / move / lock without replacing the route contents. */
router.patch('/:id', validate(waylinePatchSchema), asyncHandler((req, res) => {
  const existing = getWayline(req.params.id);
  if (!existing) throw httpError(404, 'Wayline not found');

  // A locked wayline may still be unlocked, but nothing else about it can change.
  const onlyUnlocking = Object.keys(req.body).length === 1 && req.body.locked === false;
  if (existing.locked && !onlyUnlocking) {
    throw httpError(409, 'This wayline is locked. Unlock it before editing.');
  }

  patchWayline(req.params.id, req.body);
  res.json(getWayline(req.params.id));
}));

router.post('/:id/duplicate', asyncHandler((req, res) => {
  const newId = duplicateWayline(req.params.id, req.body?.name);
  if (!newId) throw httpError(404, 'Wayline not found');
  res.status(201).json(getWayline(newId));
}));

router.delete('/:id', asyncHandler((req, res) => {
  const existing = getWayline(req.params.id);
  if (!existing) throw httpError(404, 'Wayline not found');
  if (existing.locked) throw httpError(409, 'This wayline is locked and cannot be deleted.');
  deleteWayline(req.params.id);
  res.status(204).end();
}));

export default router;
