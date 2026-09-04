/**
 * Read-only-on-the-map GEO Zone / Task Area overlays (feature-gap audit
 * §"GEO Zone / Task Area map overlays"). DJI's own zones are org-provisioned
 * data this single-tenant app has no equivalent source for — see
 * repository.js's createGeoZone for the "user-authored placeholder data"
 * framing this was scoped down to.
 */
import { Router } from 'express';
import { createGeoZone, deleteGeoZone, listGeoZones } from '../repository.js';
import { geoZoneCreateSchema } from '../schemas.js';
import { asyncHandler, httpError, validate } from '../middleware.js';

const router = Router();

router.get('/', asyncHandler((req, res) => res.json(listGeoZones())));

router.post('/', validate(geoZoneCreateSchema), asyncHandler((req, res) => {
  const id = createGeoZone(req.body);
  res.status(201).json(listGeoZones().find((z) => z.id === id));
}));

router.delete('/:id', asyncHandler((req, res) => {
  if (!deleteGeoZone(req.params.id)) throw httpError(404, 'GEO Zone not found');
  res.status(204).end();
}));

export default router;
