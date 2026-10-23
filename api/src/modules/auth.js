import { Router } from 'express';
import { createAuthController } from '../controllers/auth.js';
import { noQuery, jsonBody, noBody } from '../common/validation.js';
import { rateLimit } from '../common/rate-limit.js';
import { requireCsrf } from '../middleware/auth.js';

export function authRouter(db, config) {
    const router = Router();
    const controller = createAuthController(db, config);
    router.use(noQuery);
    router.use(requireCsrf(config));
    router.post('/register', rateLimit(db, 'register', 5, 3600), jsonBody, controller.register);
    router.post('/login', rateLimit(db, 'login-ip', 100, 900), jsonBody, controller.login);
    router.post('/refresh', noBody, controller.refresh);
    router.post('/logout', noBody, controller.logout);
    return router;
}
