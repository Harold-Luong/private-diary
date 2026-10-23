import { randomUUID } from 'node:crypto';
import { invalid, notFound } from '../common/errors.js';
import { consumeRate } from '../common/rate-limit.js';
import { authenticate } from './auth.js';

export function requestContext(_req, res, next) {
    res.locals.requestId = randomUUID();
    res.set({ 'X-Request-Id': res.locals.requestId, 'Cache-Control': 'private, no-store' });
    next();
}

export function validateApiRequest(req, _res, next) {
    if (req.method === 'HEAD') throw notFound();
    // The simple query parser represents duplicate parameters as arrays.
    if (Object.values(req.query).some(value => typeof value !== 'string')) {
        throw invalid('query', 'DUPLICATE_PARAMETER');
    }
    next();
}

export function authenticateWithRateLimit(db, config) {
    const authenticateRequest = authenticate(db, config);
    return async function authenticateApiRequest(req, res, next) {
        try { await authenticateRequest(req, res, next); }
        catch (error) {
            await consumeRate(db, 'api-invalid', req.ip ?? 'unknown', 120, 60);
            throw error;
        }
    };
}

export function routeNotFound(_req, _res, next) {
    next(notFound());
}
