import { Router } from 'express';
import { createUsersController } from '../controllers/users.js';
import { noQuery, jsonBody } from '../common/validation.js';

export function usersRouter(db) {
    const router = Router();
    const controller = createUsersController(db);
    router.use(noQuery);
    router.get('/me', controller.getCurrentUser);
    router.patch('/me', jsonBody, controller.updateCurrentUser);
    return router;
}
