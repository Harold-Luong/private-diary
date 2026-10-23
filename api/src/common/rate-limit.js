import { createHash } from 'node:crypto';
import { ApiError } from './errors.js';
export async function consumeRate(db, name, identity, limit, seconds) {
    const now = Date.now();
    const window = Math.floor(now / (seconds * 1000));
    const expiresAt = new Date((window + 1) * seconds * 1000);
    const key = createHash('sha256').update(`${name}:${identity}:${window}`).digest('hex');
    const [bucket] = await db.$queryRaw`
    INSERT INTO rate_buckets (key, hits, expires_at) VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT (key) DO UPDATE SET hits = LEAST(rate_buckets.hits + 1, ${limit + 1})
    RETURNING hits`;
    if (bucket.hits > limit) throw new ApiError(429, 'RATE_LIMITED', 'Vui lòng thử lại sau', undefined, Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)));
}
export function rateLimit(db, name, limit, seconds) {
    return async (req, res, next)=>{
        await consumeRate(db, name, res.locals.auth?.userId ?? req.ip ?? 'unknown', limit, seconds);
        next();
    };
}
