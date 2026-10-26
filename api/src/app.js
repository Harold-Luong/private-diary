import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './common/errors.js';
import { rateLimit } from './common/rate-limit.js';
import { requestContext, validateApiRequest, authenticateWithRateLimit, routeNotFound } from './middleware/request.js';
import { authRouter } from './modules/auth.js';
import { usersRouter } from './modules/users.js';
import { tagsRouter } from './modules/tags.js';
import { diariesRouter } from './modules/diaries.js';
import { imagesRouter } from './modules/images.js';
import { moodsRouter } from './modules/moods.js';
import { docsRouter } from './docs.js';
import { createHealthController } from './controllers/health.js';

export function createApp({ db, config, storage }) {
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('trust proxy', config.trustProxy);
  app.set('query parser', 'simple');
  app.use(requestContext);
  app.use(helmet());
  app.get('/health', createHealthController(db));
  app.use('/api-docs', docsRouter(config));
  app.use(cors({ origin: (origin, callback) => callback(null, Boolean(origin && config.origins.includes(origin))),
    credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-CSRF-Protection'],
    exposedHeaders: ['X-Request-Id', 'Location', 'Retry-After'], maxAge: 600 }));
  app.use('/api/v1', validateApiRequest);
  const json = express.json({ limit: 1048576, strict: true, inflate: false });
  app.use('/api/v1/auth', rateLimit(db, 'public', 120, 60), json, authRouter(db, config));
  app.use('/api/v1', authenticateWithRateLimit(db, config), rateLimit(db, 'api', 120, 60), json);
  app.use('/api/v1/users', usersRouter(db));
  app.use('/api/v1/moods', moodsRouter(db));
  app.use('/api/v1/tags', tagsRouter(db));
  app.use('/api/v1/diaries', diariesRouter(db));
  app.use('/api/v1/diaries', imagesRouter(db, storage));
  app.use(routeNotFound);
  app.use(errorHandler);
  return app;
}
