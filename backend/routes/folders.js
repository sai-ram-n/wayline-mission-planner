import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { folderCreateSchema } from '../schemas.js';
import { asyncHandler, httpError, validate } from '../middleware.js';

const router = Router();

const listStmt = db.prepare('SELECT * FROM folders ORDER BY name');
const getStmt = db.prepare('SELECT * FROM folders WHERE id = ?');

router.get('/', asyncHandler((req, res) => res.json(listStmt.all())));

router.post('/', validate(folderCreateSchema), asyncHandler((req, res) => {
  const { name, parent_id = null } = req.body;
  if (parent_id && !getStmt.get(parent_id)) throw httpError(404, 'Parent folder not found');

  const id = randomUUID();
  db.prepare('INSERT INTO folders (id, parent_id, name, created_at) VALUES (?, ?, ?, ?)')
    .run(id, parent_id, name, new Date().toISOString());
  res.status(201).json(getStmt.get(id));
}));

/**
 * Deleting a folder deletes its subfolders (ON DELETE CASCADE) and every wayline
 * inside them, matching the confirmation the reference UI shows.
 */
router.delete('/:id', asyncHandler((req, res) => {
  if (!getStmt.get(req.params.id)) throw httpError(404, 'Folder not found');

  const removeTree = db.transaction((rootId) => {
    const ids = [rootId];
    for (let i = 0; i < ids.length; i += 1) {
      const children = db.prepare('SELECT id FROM folders WHERE parent_id = ?').all(ids[i]);
      ids.push(...children.map((c) => c.id));
    }
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM waylines WHERE folder_id IN (${placeholders})`).run(...ids);
    db.prepare('DELETE FROM folders WHERE id = ?').run(rootId);
  });

  removeTree(req.params.id);
  res.status(204).end();
}));

export default router;
