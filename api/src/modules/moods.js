import { Router } from 'express';
import { createMoodsController } from '../controllers/moods.js';
import { noQuery } from '../common/validation.js';

export function moodsRouter(db) {
  const router = Router();
  const controller = createMoodsController(db);

  router.get('/', noQuery, controller.listMoods);
  return router;
}
