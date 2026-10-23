import { randomBytes, createHash } from 'node:crypto';
import { hash, verify, Algorithm } from '@node-rs/argon2';
import { SignJWT } from 'jose';
import { z } from 'zod';
import { ApiError } from '../common/errors.js';
import { email, displayName, timezone } from '../common/validation.js';
import { publicUser, userInclude } from '../common/serializers.js';
import { consumeRate } from '../common/rate-limit.js';
const registerSchema = z.strictObject({
    email,
    password: z.string().min(12).max(128),
    displayName: displayName.optional(),
    timezone: timezone.default('Asia/Ho_Chi_Minh')
});
const loginSchema = z.strictObject({
    email,
    password: z.string().min(1).max(128)
});
const options = {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
};
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(48).toString('base64url');
let dummyHash;
export function readRefresh(req, config) {
    const values = (req.headers.cookie ?? '').split(';').map((s) => s.trim()).filter((s) => s.startsWith(`${config.cookieName}=`));
    if (values.length !== 1) return null;
    const value = values[0].slice(config.cookieName.length + 1);
    return /^[A-Za-z0-9_-]{64}$/.test(value) ? value : null;
}
function cookie(res, config, token, expiresAt) {
    const attributes = {
        httpOnly: true,
        secure: config.secureCookie,
        sameSite: 'lax',
        path: '/api/v1/auth'
    };
    if (token && expiresAt) res.cookie(config.cookieName, token, {
        ...attributes,
        maxAge: Math.max(0, expiresAt.getTime() - Date.now())
    });
    else res.clearCookie(config.cookieName, attributes);
}
async function createSession(tx, userId) {
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    const token = newToken();
    const session = await tx.authSession.create({
        data: {
            userId,
            expiresAt,
            tokens: {
                create: {
                    tokenHash: tokenHash(token),
                    expiresAt
                }
            }
        }
    });
    return {
        session,
        token
    };
}
async function accessToken(config, userId, sessionId) {
    return new SignJWT({
        sid: sessionId
    }).setProtectedHeader({
        alg: 'HS256',
        typ: 'JWT'
    }).setSubject(userId).setIssuedAt().setExpirationTime('15m').setIssuer(config.jwtIssuer).setAudience(config.jwtAudience).sign(new TextEncoder().encode(config.jwtSecret));
}

export function createAuthController(db, config) {
  async function register(req, res) {
      const input = registerSchema.parse(req.body);
      const passwordHash = await hash(input.password, options);
      let result;
      try {
          result = await db.$transaction(async (tx) => {
              const user = await tx.user.create({
                  data: {
                      email: input.email,
                      passwordHash,
                      displayName: input.displayName ?? null,
                      settings: {
                          create: {
                              timezone: input.timezone
                          }
                      }
                  },
                  include: userInclude
              });
              return {
                  user,
                  ...await createSession(tx, user.id)
              };
          });
      } catch (error) {
          if (error.code === 'P2002') throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'Email đã được đăng ký');
          throw error;
      }
      cookie(res, config, result.token, result.session.expiresAt);
      res.location('/api/v1/users/me').status(201).json({
          success: true,
          data: {
              accessToken: await accessToken(config, result.user.id, result.session.id),
              tokenType: 'Bearer',
              expiresIn: 900,
              user: publicUser(result.user)
          }
      });
  }

  async function login(req, res) {
      const input = loginSchema.parse(req.body);
      await consumeRate(db, 'login-email', `${req.ip}:${tokenHash(input.email)}`, 10, 900);
      const user = await db.user.findUnique({
          where: {
              email: input.email
          },
          include: userInclude
      });
      dummyHash ??= hash(randomBytes(48).toString('hex'), options);
      const valid = await verify(user?.passwordHash ?? await dummyHash, input.password);
      if (!user || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');
      const result = await db.$transaction((tx) => createSession(tx, user.id));
      cookie(res, config, result.token, result.session.expiresAt);
      res.json({
          success: true,
          data: {
              accessToken: await accessToken(config, user.id, result.session.id),
              tokenType: 'Bearer',
              expiresIn: 900,
              user: publicUser(user)
          }
      });
  }

  async function refresh(req, res) {
      const rawToken = readRefresh(req, config);
      const found = rawToken ? await db.refreshToken.findUnique({
          where: {
              tokenHash: tokenHash(rawToken)
          }
      }) : null;
      await consumeRate(db, 'refresh', found?.sessionId ?? req.ip ?? 'unknown', 30, 60);
      const result = found ? await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id = ${found.sessionId}::uuid FOR UPDATE`;
          const session = await tx.authSession.findUnique({
              where: {
                  id: found.sessionId
              },
              include: {
                  user: {
                      include: userInclude
                  }
              }
          });
          const old = await tx.refreshToken.findUnique({
              where: {
                  id: found.id
              }
          });
          if (!session || !old || session.revokedAt || session.expiresAt <= new Date() || old.expiresAt <= new Date()) return {
              error: 'INVALID_REFRESH_TOKEN'
          };
          if (old.usedAt) {
              await tx.authSession.update({
                  where: {
                      id: session.id
                  },
                  data: {
                      revokedAt: new Date()
                  }
              });
              return {
                  error: 'REFRESH_TOKEN_REUSED'
              };
          }
          const token = newToken();
          const replacement = await tx.refreshToken.create({
              data: {
                  sessionId: session.id,
                  tokenHash: tokenHash(token),
                  expiresAt: session.expiresAt
              }
          });
          await tx.refreshToken.update({
              where: {
                  id: old.id
              },
              data: {
                  usedAt: new Date(),
                  replacedById: replacement.id
              }
          });
          return {
              session,
              token
          };
      }) : {
          error: 'INVALID_REFRESH_TOKEN'
      };
      if ('error' in result) {
          cookie(res, config);
          throw new ApiError(401, result.error, 'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại');
      }
      cookie(res, config, result.token, result.session.expiresAt);
      res.json({
          success: true,
          data: {
              accessToken: await accessToken(config, result.session.userId, result.session.id),
              tokenType: 'Bearer',
              expiresIn: 900,
              user: publicUser(result.session.user)
          }
      });
  }

  async function logout(req, res) {
      const token = readRefresh(req, config);
      const found = token ? await db.refreshToken.findUnique({
          where: {
              tokenHash: tokenHash(token)
          }
      }) : null;
      if (found) await db.authSession.updateMany({
          where: {
              id: found.sessionId,
              revokedAt: null
          },
          data: {
              revokedAt: new Date()
          }
      });
      cookie(res, config);
      res.status(204).end();
  }

  return { register, login, refresh, logout };
}
