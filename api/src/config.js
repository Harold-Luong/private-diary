import './env.js';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
const envSchema = z.object({
    NODE_ENV: z.enum([
        'development',
        'test',
        'production'
    ]).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    FRONTEND_URL: z.string().default('http://localhost:5173'),
    SWAGGER_ORIGIN: z.string().optional(),
    DATABASE_URL: z.url(),
    JWT_SECRET: z.string().optional(),
    JWT_ISSUER: z.string().default('private-diary-api'),
    JWT_AUDIENCE: z.string().default('private-diary-web'),
    STORAGE_DRIVER: z.enum([
        'local',
        'r2'
    ]).default('local'),
    LOCAL_STORAGE_PATH: z.string().default('.data/images'),
    COOKIE_SECURE: z.enum([
        'true',
        'false'
    ]).optional(),
    TRUST_PROXY: z.string().default('false'),
    R2_ENDPOINT: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional()
});
export function loadConfig(env = process.env) {
    const result = envSchema.safeParse(env);
    if (!result.success) throw new Error(`Invalid environment keys: ${result.error.issues.map((i)=>i.path.join('.')).join(', ')}`);
    const e = result.data;
    const production = e.NODE_ENV === 'production';
    const secureCookie = e.COOKIE_SECURE ? e.COOKIE_SECURE === 'true' : production;
    if (e.JWT_SECRET && Buffer.byteLength(e.JWT_SECRET) < 32) throw new Error('JWT_SECRET must have at least 32 bytes');
    if (production && (!e.JWT_SECRET || !secureCookie || e.STORAGE_DRIVER !== 'r2')) {
        throw new Error('Production requires JWT_SECRET, secure cookies and R2 storage');
    }
    const origins = e.FRONTEND_URL.split(',').map((s)=>s.trim());
    const swaggerOrigin = e.SWAGGER_ORIGIN || (!production ? `http://localhost:${e.PORT}` : undefined);
    if (swaggerOrigin && !origins.includes(swaggerOrigin)) origins.push(swaggerOrigin);
    for (const origin of origins){
        const url = new URL(origin);
        if (url.origin !== origin || ![
            'http:',
            'https:'
        ].includes(url.protocol) || production && url.protocol !== 'https:') {
            throw new Error('FRONTEND_URL and SWAGGER_ORIGIN must contain exact origins (HTTPS in production)');
        }
    }
    if (e.STORAGE_DRIVER === 'r2' && (!e.R2_ENDPOINT || !e.R2_BUCKET || !e.R2_ACCESS_KEY_ID || !e.R2_SECRET_ACCESS_KEY)) {
        throw new Error('R2 storage requires endpoint, bucket and credentials');
    }
    if (e.R2_ENDPOINT && new URL(e.R2_ENDPOINT).protocol !== 'https:') throw new Error('R2 endpoint must use HTTPS');
    if (e.TRUST_PROXY === 'true') throw new Error('TRUST_PROXY must be false or an explicit proxy IP/subnet allowlist');
    return {
        env: e.NODE_ENV,
        port: e.PORT,
        databaseUrl: e.DATABASE_URL,
        origins,
        jwtSecret: e.JWT_SECRET || randomBytes(48).toString('base64url'),
        ephemeralJwtSecret: !e.JWT_SECRET,
        jwtIssuer: e.JWT_ISSUER,
        jwtAudience: e.JWT_AUDIENCE,
        secureCookie,
        cookieName: secureCookie ? '__Secure-diary_refresh' : 'diary_refresh',
        trustProxy: e.TRUST_PROXY === 'false' ? false : e.TRUST_PROXY.split(',').map((s)=>s.trim()),
        storageDriver: e.STORAGE_DRIVER,
        localStoragePath: resolve(e.LOCAL_STORAGE_PATH),
        r2: {
            endpoint: e.R2_ENDPOINT,
            bucket: e.R2_BUCKET,
            accessKeyId: e.R2_ACCESS_KEY_ID,
            secretAccessKey: e.R2_SECRET_ACCESS_KEY
        }
    };
}
