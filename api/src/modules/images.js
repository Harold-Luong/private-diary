import { Router } from 'express';
import { createImagesController } from '../controllers/images.js';
import { noQuery, jsonBody, noBody } from '../common/validation.js';
import { rateLimit } from '../common/rate-limit.js';

export function imagesRouter(db, storage) {
  const router = Router();
  const controller = createImagesController(db, storage);
  router.use(noQuery);
  router.get('/:id/images', controller.listImages);
  router.post('/:id/images', rateLimit(db, 'upload', 30, 600), controller.uploadImage);
  router.patch('/:id/images/order', jsonBody, controller.reorderImages);
  router.get('/:id/images/:imageId/content', controller.getImageContent);
  router.delete('/:id/images/:imageId', noBody, controller.deleteImage);
  return router;
}
