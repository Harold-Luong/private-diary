import { Router } from 'express';
import { createDiariesController } from '../controllers/diaries.js';
import { noQuery, jsonBody, noBody } from '../common/validation.js';

export function diariesRouter(db) {
    const router = Router();
    const controller = createDiariesController(db);
    router.get('/calendar', controller.getCalendar);
    router.get('/statistics', controller.getStatistics);
    router.get('/', controller.listDiaries);
    router.post('/', noQuery, jsonBody, controller.createDiary);
    router.get('/:id', noQuery, controller.getDiary);
    router.patch('/:id', noQuery, jsonBody, controller.updateDiary);
    router.delete('/:id', noQuery, noBody, controller.deleteDiary);
    return router;
}
