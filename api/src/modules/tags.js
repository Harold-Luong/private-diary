import { Router } from 'express';
import { createTagsController } from '../controllers/tags.js';
import { noQuery, jsonBody, noBody } from '../common/validation.js';

export function tagsRouter(db) {
    const router = Router();
    const controller = createTagsController(db);
    router.get('/', controller.listTags);
    router.post('/', noQuery, jsonBody, controller.createTag);
    router.patch('/:tagId', noQuery, jsonBody, controller.updateTag);
    router.delete('/:tagId', noQuery, noBody, controller.deleteTag);
    return router;
}
