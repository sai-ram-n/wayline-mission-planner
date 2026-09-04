/**
 * Free-standing map annotations (feature-gap audit §"Map annotation,
 * measurement, and rectangle/circle draw tools") — independent of any one
 * wayline, the same way DJI FlightHub's annotation layer sits under every
 * route on the project map.
 */
import { Router } from 'express';
import { createAnnotation, deleteAnnotation, listAnnotations } from '../repository.js';
import { annotationCreateSchema } from '../schemas.js';
import { asyncHandler, httpError, validate } from '../middleware.js';

const router = Router();

router.get('/', asyncHandler((req, res) => res.json(listAnnotations())));

router.post('/', validate(annotationCreateSchema), asyncHandler((req, res) => {
  const id = createAnnotation(req.body);
  res.status(201).json(listAnnotations().find((a) => a.id === id));
}));

router.delete('/:id', asyncHandler((req, res) => {
  if (!deleteAnnotation(req.params.id)) throw httpError(404, 'Annotation not found');
  res.status(204).end();
}));

export default router;
