import { jwtVerify, errors as jwtErrors } from 'jose';
import { ApiError } from '../common/errors.js';
import { id } from '../common/validation.js';

const unauthenticated = () => new ApiError(401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập');

export function authenticate(db, config) {
    return async function authenticateRequest(req, res, next) {
        const match = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '');
        if (!match) throw unauthenticated();
        let payload;
        try {
            ({ payload } = await jwtVerify(match[1], new TextEncoder().encode(config.jwtSecret), {
                algorithms: [
                    'HS256'
                ],
                issuer: config.jwtIssuer,
                audience: config.jwtAudience,
                requiredClaims: [
                    'sub',
                    'sid',
                    'iat',
                    'exp'
                ]
            }));
        } catch (error) {
            if (error instanceof jwtErrors.JWTExpired) throw new ApiError(401, 'ACCESS_TOKEN_EXPIRED', 'Phiên truy cập đã hết hạn');
            throw unauthenticated();
        }
        if (!id.safeParse(payload.sub).success || !id.safeParse(payload.sid).success) throw unauthenticated();
        const session = await db.authSession.findFirst({
            where: {
                id: payload.sid,
                userId: payload.sub,
                revokedAt: null,
                expiresAt: {
                    gt: new Date()
                }
            }
        });
        if (!session) throw unauthenticated();
        res.locals.auth = {
            userId: session.userId,
            sessionId: session.id
        };
        next();
    };
}

export function requireCsrf(config) {
    return function validateCsrf(req, _res, next) {
        if (!config.origins.includes(req.headers.origin ?? '') || req.headers['x-csrf-protection'] !== '1') {
            throw new ApiError(403, 'CSRF_FAILED', 'Nguồn yêu cầu không hợp lệ');
        }
        next();
    };
}
