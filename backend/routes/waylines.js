import { Router } from 'express';
import {
  createWayline,
  deleteWayline,
  duplicateWayline,
  getWayline,
  listWaylines,
  mergeWaylines,
  patchWayline,
  updateWayline,
} from '../repository.js';
import {
  waylineCreateSchema,
  waylineMergeSchema,
  waylinePatchSchema,
  waylineUpdateSchema,
} from '../schemas.js';
import { asyncHandler, httpError, validate } from '../middleware.js';
import { buildKmz, parseKmz } from '../wpml.js';

const router = Router();

router.get('/', asyncHandler((req, res) => {
  let items = listWaylines();

  const { q, model, series, route_type, sort, folder_id } = req.query;
  // "root" selects waylines that sit outside every folder.
  if (folder_id) {
    items =
      folder_id === 'root'
        ? items.filter((w) => !w.folder_id)
        : items.filter((w) => w.folder_id === folder_id);
  }
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

/**
 * Export a wayline as a real DJI-compatible .kmz (feature-reference §7).
 * Declared before /:id so "import" is never read as an id.
 */
router.post('/import', asyncHandler(async (req, res) => {
  // The body arrives as a raw octet-stream, so no multipart parser is needed.
  const buffer = req.body;
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw httpError(400, 'Send the .kmz file as the request body');
  }
  if (buffer.length > 10 * 1024 * 1024) {
    throw httpError(413, 'That .kmz is larger than the 10 MB import limit');
  }

  const name = typeof req.query.name === 'string' ? req.query.name.slice(0, 120) : undefined;
  const payload = await parseKmz(buffer, { name });

  const parsed = waylineCreateSchema.safeParse(payload);
  if (!parsed.success) {
    throw httpError(422, 'The .kmz parsed but does not describe a valid route', parsed.error.issues);
  }

  const id = createWayline(parsed.data);
  res.status(201).json(getWayline(id));
}));

/**
 * Combine several waylines into one (repository.js's mergeWaylines — this
 * app's own defined behaviour; DJI's own Merge dialog was never exercised in
 * the source exploration). Declared before /:id for the same reason /import is.
 */
router.post('/merge', validate(waylineMergeSchema), asyncHandler((req, res) => {
  const { ids, name } = req.body;
  const result = mergeWaylines(ids, name);
  if (result.error === 'not_found') {
    throw httpError(404, 'One or more of the selected routes could not be found');
  }
  if (result.error === 'mixed_route_types') {
    throw httpError(422, 'Only routes of the same type can be merged');
  }
  res.status(201).json(getWayline(result.id));
}));

router.get('/:id/kmz', asyncHandler(async (req, res) => {
  const wayline = getWayline(req.params.id);
  if (!wayline) throw httpError(404, 'Wayline not found');

  const kmz = await buildKmz(wayline);
  // A conservative filename: keep it readable but safe on every filesystem.
  const safeName = (wayline.name || 'wayline').replace(/[^\w.-]+/g, '_').slice(0, 80);
  res.setHeader('Content-Type', 'application/vnd.google-earth.kmz');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.kmz"`);
  res.send(kmz);
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
