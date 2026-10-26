import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { SignJWT } from 'jose';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createStorage } from '../src/storage.js';
import { runCleanup } from '../src/jobs/cleanup.js';
import { consumeRate } from '../src/common/rate-limit.js';
import { todayIn } from '../src/common/validation.js';
import { seedMoods } from '../prisma/seed.js';
import { testDatabase } from './helpers.js';

let fixture, db, config, storage, app, owner, other, moods;
const origin = 'http://localhost:5173';
const password = 'test-only-strong-password';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhZkAAAAASUVORK5CYII=', 'base64');
const csrf = req => req.set('Origin', origin).set('X-CSRF-Protection', '1');
const call = (method, path, account = owner) => request(app)[method](`/api/v1${path}`).set('Authorization', `Bearer ${account.accessToken}`);
const getCookie = response => response.headers['set-cookie'][0].split(';')[0];
async function login() {
  const response = await csrf(request(app).post('/api/v1/auth/login')).send({ email: 'owner@example.com', password });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return { ...response.body.data, cookie: getCookie(response) };
}
async function diary(input = {}, account = owner) {
  const response = await call('post', '/diaries', account).send(input);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data;
}
async function upload(diaryId, bytes = png, mime = 'image/png') {
  return call('post', `/diaries/${diaryId}/images`).attach('file', bytes, { filename: 'photo.png', contentType: mime });
}

before(async () => {
  fixture = await testDatabase();
  config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: fixture.url, FRONTEND_URL: origin, JWT_SECRET: 'test-secret-with-at-least-32-bytes-long', STORAGE_DRIVER: 'local', LOCAL_STORAGE_PATH: fixture.storagePath });
  db = createDb(config.databaseUrl);
  await seedMoods(db);
  storage = createStorage(config);
  app = createApp({ db, config, storage });
  for (const name of ['owner', 'other']) {
    const response = await csrf(request(app).post('/api/v1/auth/register')).send({ email: `${name}@example.com`, password });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    const account = { ...response.body.data, cookie: getCookie(response) };
    if (name === 'owner') owner = account; else other = account;
  }
  moods = (await call('get', '/moods')).body.data;
}, { timeout: 90000 });
beforeEach(async () => { if (db) await db.rateBucket.deleteMany(); });
after(async () => { await db?.$disconnect(); await fixture?.stop(); });

test('health checks the real PostgreSQL connection without authentication', async () => {
  const response = await request(app).get('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok', database: 'up' });
});

test('Swagger UI and its assets/spec are public and target the current API origin', async () => {
  const page = await request(app).get('/api-docs/');
  assert.equal(page.status, 200);
  assert.match(page.text, /Private Diary API — Swagger UI/);
  assert.match(page.headers['content-security-policy'], /script-src 'self'/);
  assert.equal(page.headers['content-security-policy'].includes('upgrade-insecure-requests'), false);
  for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-init.js']) {
    const response = await request(app).get(`/api-docs/${asset}`);
    assert.equal(response.status, 200, asset);
    if (asset === 'swagger-ui-init.js') {
      assert.match(response.text, /X-CSRF-Protection/);
      assert.match(response.text, /"persistAuthorization": false/);
      assert.match(response.text, /"validatorUrl": null/);
    }
  }
  const spec = await request(app).get('/api-docs/openapi.json');
  assert.equal(spec.status, 200);
  assert.equal(spec.body.servers[0].url, '/api/v1');
  assert.equal(spec.body.components.securitySchemes.refreshCookie.name, 'diary_refresh');
  assert.equal(Object.values(spec.body.paths).reduce((n, path) => n + Object.keys(path).length, 0), 23);
  assert.ok(spec.body.paths['/auth/login'].post.parameters.every(p => p.$ref !== '#/components/parameters/Origin'));
  assert.match((await request(app).get('/api-docs/openapi.yaml')).text, /^openapi: 3\.0\.3/);
});

test('Swagger origin can login/refresh with CSRF; untrusted origins remain blocked', async () => {
  const login = await request(app).post('/api/v1/auth/login').set('Origin', `http://localhost:${config.port}`)
    .set('X-CSRF-Protection', '1').send({ email: 'owner@example.com', password });
  assert.equal(login.status, 200);
  const refreshed = await request(app).post('/api/v1/auth/refresh').set('Origin', `http://localhost:${config.port}`)
    .set('X-CSRF-Protection', '1').set('Cookie', getCookie(login));
  assert.equal(refreshed.status, 200);
  assert.equal((await request(app).post('/api/v1/auth/refresh').set('Origin', `http://localhost:${config.port}`)).status, 403);
  assert.equal((await request(app).post('/api/v1/auth/login').set('Origin', 'https://evil.example')
    .set('X-CSRF-Protection', '1').send({ email: 'owner@example.com', password })).status, 403);
});

test('auth requires Origin + CSRF, cookies are HttpOnly, duplicate normalized email conflicts', async () => {
  const forbidden = await request(app).post('/api/v1/auth/login').send({ email: 'owner@example.com', password });
  assert.equal(forbidden.status, 403);
  const wrongOrigin = await request(app).post('/api/v1/auth/login').set('Origin', 'https://evil.example').set('X-CSRF-Protection', '1').send({ email: 'owner@example.com', password });
  assert.equal(wrongOrigin.status, 403);
  const duplicate = await csrf(request(app).post('/api/v1/auth/register')).send({ email: ' OWNER@EXAMPLE.COM ', password });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'EMAIL_ALREADY_EXISTS');
  const logged = await csrf(request(app).post('/api/v1/auth/login')).send({ email: 'Owner@Example.Com', password });
  assert.equal(logged.status, 200);
  assert.match(logged.headers['set-cookie'][0], /HttpOnly/);
  assert.match(logged.headers['set-cookie'][0], /SameSite=Lax/);
  assert.match(logged.headers['set-cookie'][0], /Path=\/api\/v1\/auth/);
  assert.equal(logged.body.data.user.passwordHash, undefined);
  assert.equal(logged.body.data.refreshToken, undefined);
  const preflight = await request(app).options('/api/v1/auth/refresh').set('Origin', origin).set('Access-Control-Request-Method', 'POST');
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], origin);
  assert.equal(preflight.headers['access-control-allow-credentials'], 'true');
});

test('invalid login is generic; unknown fields and invalid JSON are rejected safely', async () => {
  for (const email of ['owner@example.com', 'missing@example.com']) {
    const result = await csrf(request(app).post('/api/v1/auth/login')).send({ email, password: 'wrong' });
    assert.equal(result.status, 401);
    assert.equal(result.body.error.code, 'INVALID_CREDENTIALS');
  }
  const forbiddenField = await call('post', '/diaries').send({ userId: other.user.id });
  assert.equal(forbiddenField.status, 400);
  const malformed = await call('post', '/diaries').set('Content-Type', 'application/json').send('{');
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.requestId, malformed.headers['x-request-id']);
  assert.equal(malformed.headers['cache-control'], 'private, no-store');
  assert.equal(JSON.stringify(malformed.body).includes('SyntaxError'), false);
  assert.equal((await call('post', '/diaries').send({ content: 'x'.repeat(1048576) })).status, 413);
});

test('refresh rotates tokens; reuse revokes only that session and its bearer token', async () => {
  const session = await login();
  const refreshed = await csrf(request(app).post('/api/v1/auth/refresh')).set('Cookie', session.cookie);
  assert.equal(refreshed.status, 200);
  assert.notEqual(getCookie(refreshed), session.cookie);
  const replay = await csrf(request(app).post('/api/v1/auth/refresh')).set('Cookie', session.cookie);
  assert.equal(replay.status, 401);
  assert.equal(replay.body.error.code, 'REFRESH_TOKEN_REUSED');
  assert.match(replay.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
  assert.equal((await call('get', '/users/me', refreshed.body.data)).status, 401);
  assert.equal((await call('get', '/users/me')).status, 200);
});

test('parallel refresh creates one successor, replay revokes it; logout is idempotent', async () => {
  const session = await login();
  const results = await Promise.all(Array.from({ length: 2 }, () => csrf(request(app).post('/api/v1/auth/refresh')).set('Cookie', session.cookie)));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
  assert.equal((await call('get', '/users/me', results.find(r => r.status === 200).body.data)).status, 401);
  const logoutSession = await login();
  for (let i = 0; i < 2; i++) assert.equal((await csrf(request(app).post('/api/v1/auth/logout')).set('Cookie', logoutSession.cookie)).status, 204);
  assert.equal((await call('get', '/users/me', logoutSession)).status, 401);
  assert.equal((await csrf(request(app).post('/api/v1/auth/logout'))).status, 204);
  assert.equal((await csrf(request(app).post('/api/v1/auth/refresh'))).status, 401);
});

test('JWT expiry, bad signature and missing bearer are rejected', async () => {
  const valid = await db.authSession.findFirst({ where: { userId: owner.user.id, revokedAt: null } });
  const expired = await new SignJWT({ sid: valid.id }).setProtectedHeader({ alg: 'HS256' }).setSubject(owner.user.id)
    .setIssuer(config.jwtIssuer).setAudience(config.jwtAudience).setIssuedAt(1).setExpirationTime(2).sign(new TextEncoder().encode(config.jwtSecret));
  assert.equal((await call('get', '/users/me', { accessToken: expired })).body.error.code, 'ACCESS_TOKEN_EXPIRED');
  assert.equal((await call('get', '/users/me', { accessToken: 'broken.jwt.token' })).status, 401);
  assert.equal((await request(app).get('/api/v1/moods')).status, 401);
});

test('draft, publish, merged PATCH validation and timezone dates follow the contract', async () => {
  const entry = await diary();
  assert.equal(entry.content, '');
  assert.equal(entry.status, 'DRAFT');
  assert.equal(entry.diaryDate, todayIn('Asia/Ho_Chi_Minh'));
  assert.equal((await call('patch', `/diaries/${entry.id}`).send({ status: 'PUBLISHED' })).status, 400);
  assert.equal((await call('patch', `/diaries/${entry.id}`).send({ content: 'done', status: 'PUBLISHED' })).status, 200);
  assert.equal((await call('patch', `/diaries/${entry.id}`).send({ content: ' \n ' })).status, 400);
  assert.equal((await call('patch', `/diaries/${entry.id}`).send({ status: 'DRAFT', content: '' })).status, 200);
  assert.equal((await call('post', '/diaries').send({ content: 'future', status: 'PUBLISHED', diaryDate: '9999-12-31' })).status, 400);
  assert.equal((await call('post', '/diaries').send({ diaryDate: '2025-02-29' })).status, 400);
  assert.equal((await call('patch', `/diaries/${entry.id}`).send({})).status, 400);
  assert.equal((await call('patch', '/users/me').send({ settings: { timezone: 'America/Los_Angeles', theme: 'DARK' }, displayName: null })).status, 200);
  assert.equal((await call('get', `/diaries/${entry.id}`)).body.data.diaryDate, entry.diaryDate);
  const updated = await call('patch', '/users/me').send({ settings: { timezone: 'Asia/Ho_Chi_Minh' } });
  assert.equal(updated.body.data.settings.theme, 'DARK');
  assert.equal((await call('patch', '/users/me').send({ settings: {} })).status, 400);
  assert.equal((await call('patch', '/users/me').send({ settings: { timezone: 'Invalid/Zone' } })).status, 400);
});

test('ownership is enforced for every diary mutation and tag attachment', async () => {
  const entry = await diary({}, other);
  for (const method of ['get', 'delete']) assert.equal((await call(method, `/diaries/${entry.id}`)).status, 404);
  assert.equal((await call('patch', `/diaries/${entry.id}`).send({ title: 'attack' })).status, 404);
  const foreignTag = await call('post', '/tags', other).send({ name: 'foreign' });
  assert.equal((await call('post', '/diaries').send({ tagIds: [foreignTag.body.data.id] })).body.error.code, 'INVALID_TAGS');
  assert.equal((await call('post', '/diaries').send({ moodId: randomUUID() })).body.error.code, 'INVALID_MOOD');
  assert.equal((await call('get', `/diaries?tagId=${foreignTag.body.data.id}`)).body.data.length, 0);
  assert.equal((await call('get', '/diaries/not-a-uuid')).status, 400);
});

test('tag normalization, conflicts, rename, pagination and cascade deletion', async () => {
  const created = await call('post', '/tags').send({ name: '  gia đình  ' });
  assert.equal(created.status, 201);
  const tagId = created.body.data.id;
  assert.equal(created.body.data.name, 'gia đình');
  assert.equal((await call('post', '/tags').send({ name: 'gia đình'.normalize('NFD') })).status, 409);
  const entry = await diary({ tagIds: [tagId], moodId: moods[3].id });
  assert.equal(entry.tags[0].id, tagId);
  assert.equal(entry.mood.score, 4);
  assert.equal((await call('patch', `/tags/${tagId}`).send({ name: 'nhà' })).status, 200);
  assert.equal((await call('get', `/diaries/${entry.id}`)).body.data.tags[0].name, 'nhà');
  const listed = await call('get', '/tags?keyword=NHÀ&limit=1');
  assert.equal(listed.body.meta.total, 1);
  assert.equal((await call('delete', `/tags/${tagId}`)).status, 204);
  assert.deepEqual((await call('get', `/diaries/${entry.id}`)).body.data.tags, []);
  assert.equal((await call('delete', `/tags/${tagId}`)).status, 404);
});

test('list filters are AND, dates inclusive, LIKE characters literal, pagination strict', async () => {
  const tag = (await call('post', '/tags').send({ name: 'list-filter' })).body.data;
  const input = { diaryDate: '2000-01-01', status: 'PUBLISHED', moodId: moods[3].id, tagIds: [tag.id] };
  const first = await diary({ ...input, content: 'literal 100%_done', title: 'Search needle' });
  await diary({ ...input, diaryDate: '2000-01-02', content: 'different' });
  const result = await call('get', `/diaries?keyword=${encodeURIComponent('%_')}&tagId=${tag.id}&moodId=${moods[3].id}&status=PUBLISHED&fromDate=2000-01-01&toDate=2000-01-01&limit=1`);
  assert.equal(result.body.meta.total, 1);
  assert.equal(result.body.data[0].id, first.id);
  assert.equal(result.body.data[0].content, undefined);
  assert.equal(result.body.data[0].images, undefined);
  assert.equal((await call('get', '/diaries?page=10000')).body.data.length, 0);
  for (const query of ['limit=51', 'page=0', 'unknown=1', 'page=1&page=2', 'sort=title:asc', 'fromDate=2026-02-01&toDate=2026-01-01']) {
    assert.equal((await call('get', `/diaries?${query}`)).status, 400, query);
  }
});

test('calendar includes leap days and statistics do not duplicate tagged/image diaries', async () => {
  const tag = (await call('post', '/tags').send({ name: 'stats-filter' })).body.data;
  const a = await diary({ diaryDate: '2004-02-29', status: 'PUBLISHED', content: 'A', moodId: moods[3].id, tagIds: [tag.id] });
  await diary({ diaryDate: '2004-02-29', status: 'PUBLISHED', content: 'B', moodId: moods[4].id });
  await diary({ diaryDate: '2004-02-28', status: 'PUBLISHED', content: 'C' });
  await diary({ diaryDate: '2004-02-29' });
  assert.equal((await upload(a.id)).status, 201);
  assert.equal((await upload(a.id)).status, 201);
  const calendar = await call('get', '/diaries/calendar?year=2004&month=2');
  assert.equal(calendar.body.data.days.length, 29);
  assert.deepEqual(calendar.body.data.days[28], { date: '2004-02-29', total: 3, draftCount: 1, publishedCount: 2 });
  const stats = (await call('get', '/diaries/statistics?fromDate=2004-02-01&toDate=2004-02-29')).body.data;
  assert.equal(stats.totalEntries, 3);
  assert.equal(stats.activeDays, 2);
  assert.equal(stats.imageCount, 2);
  assert.equal(stats.averageMoodScore, 4.5);
  assert.deepEqual(stats.moodDistribution.at(-1), { moodId: null, count: 1 });
  assert.equal((await call('get', '/diaries/statistics?fromDate=2004-02-01&toDate=2004-02-29&status=ALL')).body.data.totalEntries, 4);
  assert.equal((await call('get', '/diaries/statistics?fromDate=2004-01-01')).status, 400);
  assert.equal((await call('get', '/diaries/statistics?fromDate=2000-01-01&toDate=2004-01-01')).status, 400);
  const empty = (await call('get', '/diaries/statistics?fromDate=1900-01-01&toDate=1900-01-01')).body.data;
  assert.equal(empty.totalEntries, 0);
  assert.equal(empty.averageMoodScore, null);
  assert.deepEqual(empty.moodDistribution, []);
});

test('private images upload/list/stream/reorder/delete and parent ownership', async () => {
  const entry = await diary();
  const first = await upload(entry.id);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const image = first.body.data;
  assert.equal(image.objectKey, undefined);
  const second = await upload(entry.id);
  assert.equal(second.status, 201);
  assert.equal((await call('get', `/diaries/${entry.id}/images`)).body.data.length, 2);
  const bytes = await call('get', `/diaries/${entry.id}/images/${image.id}/content`).set('Range', 'bytes=0-1');
  assert.equal(bytes.status, 200);
  assert.deepEqual(bytes.body, png);
  assert.equal(bytes.headers['cache-control'], 'private, no-store');
  assert.equal(bytes.headers['content-type'], 'image/png');
  const foreignDiary = await diary({}, other);
  assert.equal((await call('get', `/diaries/${entry.id}/images/${image.id}/content`, other)).status, 404);
  assert.equal((await call('get', `/diaries/${foreignDiary.id}/images/${image.id}/content`)).status, 404);
  assert.equal((await upload(foreignDiary.id)).status, 404);
  const order = await call('patch', `/diaries/${entry.id}/images/order`).send({ imageIds: [second.body.data.id, image.id] });
  assert.equal(order.status, 200);
  assert.equal(order.body.data[0].id, second.body.data.id);
  assert.equal((await call('patch', `/diaries/${entry.id}/images/order`).send({ imageIds: [image.id] })).status, 409);
  assert.equal((await call('patch', `/diaries/${entry.id}/images/order`).send({ imageIds: [image.id, image.id] })).status, 400);
  assert.equal((await call('delete', `/diaries/${entry.id}/images/${image.id}`)).status, 204);
  assert.equal((await call('get', `/diaries/${entry.id}/images/${image.id}/content`)).status, 404);
  assert.equal((await call('get', `/diaries/${entry.id}/images`)).body.data[0].sortOrder, 0);
});

test('multipart rejects fake MIME, empty/extra fields, multiple files and oversized bytes', async () => {
  const entry = await diary();
  assert.equal((await upload(entry.id, Buffer.from('not an image'), 'image/jpeg')).status, 415);
  assert.equal((await upload(entry.id, png, 'image/jpeg')).status, 415);
  assert.equal((await upload(entry.id, Buffer.alloc(0))).status, 400);
  assert.equal((await call('post', `/diaries/${entry.id}/images`).field('unknown', 'x').attach('file', png, 'x.png')).status, 400);
  assert.equal((await call('post', `/diaries/${entry.id}/images`).attach('file', png, 'x.png').attach('file', png, 'y.png')).status, 400);
  assert.equal((await upload(entry.id, Buffer.alloc(10000001))).status, 413);
});

test('concurrent uploads cannot exceed ten images and failed finalize gets compensated', async () => {
  const entry = await diary();
  for (let i = 0; i < 9; i++) assert.equal((await upload(entry.id)).status, 201);
  const results = await Promise.all([upload(entry.id), upload(entry.id)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal(await db.diaryImage.count({ where: { diaryId: entry.id } }), 10);
  assert.equal((await upload(entry.id)).body.error.code, 'IMAGE_LIMIT_EXCEEDED');
  const pending = await db.storageDeleteJob.findMany();
  assert.ok(pending.length > 0);
});

test('soft delete hides diary and all images immediately; cleanup retries independently', async () => {
  const entry = await diary({ diaryDate: '1999-01-01' });
  const image = (await upload(entry.id)).body.data;
  const metadata = await db.diaryImage.findUnique({ where: { id: image.id } });
  assert.equal((await call('delete', `/diaries/${entry.id}`)).status, 204);
  assert.equal((await call('get', `/diaries/${entry.id}`)).status, 404);
  assert.equal((await call('get', `/diaries/${entry.id}/images`)).status, 404);
  assert.equal((await call('get', `/diaries/${entry.id}/images/${image.id}/content`)).status, 404);
  assert.equal((await call('get', '/diaries?fromDate=1999-01-01&toDate=1999-01-01')).body.meta.total, 0);
  assert.equal((await call('delete', `/diaries/${entry.id}`)).status, 404);
  const failed = await runCleanup(db, { ...storage, delete: async () => { throw new Error('simulated outage'); } });
  assert.ok(failed.failed > 0);
  assert.ok(await db.storageDeleteJob.findUnique({ where: { objectKey: metadata.objectKey } }));
  await db.storageDeleteJob.updateMany({ data: { nextAttemptAt: new Date(0) } });
  const retried = await runCleanup(db, storage);
  assert.ok(retried.completed > 0);
  await assert.rejects(access(join(config.localStoragePath, metadata.objectKey)));
});

test('expired upload intents and aged orphan objects are reconciled without deleting live images', async () => {
  const entry = await diary();
  const live = (await upload(entry.id)).body.data;
  const liveRecord = await db.diaryImage.findUnique({ where: { id: live.id } });
  const key = `diaries/${owner.user.id}/${entry.id}/${randomUUID()}.png`;
  await db.imageUploadIntent.create({ data: { userId: owner.user.id, diaryId: entry.id, objectKey: key, expiresAt: new Date(0) } });
  await storage.put(key, png);
  const orphan = `diaries/${owner.user.id}/${entry.id}/${randomUUID()}.png`;
  await storage.put(orphan, png);
  const old = new Date(Date.now() - 2 * 86400000);
  await utimes(join(config.localStoragePath, orphan), old, old);
  await utimes(join(config.localStoragePath, liveRecord.objectKey), old, old);
  await runCleanup(db, storage, { reconcile: true });
  await assert.rejects(access(join(config.localStoragePath, orphan)));
  await assert.rejects(access(join(config.localStoragePath, key)));
  await access(join(config.localStoragePath, liveRecord.objectKey));
});

test('missing stored bytes return 503 and DB-backed rate limits are atomic', async () => {
  const entry = await diary();
  const image = (await upload(entry.id)).body.data;
  const record = await db.diaryImage.findUnique({ where: { id: image.id } });
  await storage.delete(record.objectKey);
  const result = await call('get', `/diaries/${entry.id}/images/${image.id}/content`);
  assert.equal(result.status, 503);
  assert.equal(result.body.error.code, 'STORAGE_UNAVAILABLE');
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => consumeRate(db, 'test', 'one-client', 3, 60)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => r.reason.status === 429 && r.reason.retryAfter > 0));
});

test('a database insert failure after storage PUT rolls back metadata and cleans the object', async () => {
  const entry = await diary();
  await db.$executeRawUnsafe("CREATE FUNCTION test_reject_image() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated database outage'; END $$");
  await db.$executeRawUnsafe('CREATE TRIGGER test_reject_image BEFORE INSERT ON diary_images FOR EACH ROW EXECUTE FUNCTION test_reject_image()');
  try {
    const response = await upload(entry.id);
    assert.equal(response.status, 500);
    assert.equal(response.body.error.code, 'INTERNAL_ERROR');
    assert.equal(JSON.stringify(response.body).includes('simulated'), false);
    assert.equal(await db.diaryImage.count({ where: { diaryId: entry.id } }), 0);
    const intent = await db.imageUploadIntent.findFirstOrThrow({ where: { diaryId: entry.id } });
    assert.equal(intent.status, 'ABANDONED');
    await assert.rejects(access(join(config.localStoragePath, intent.objectKey)));
    assert.ok(await db.storageDeleteJob.findUnique({ where: { objectKey: intent.objectKey } }));
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER test_reject_image ON diary_images');
    await db.$executeRawUnsafe('DROP FUNCTION test_reject_image()');
  }
});

test('deleting a diary while an upload is in flight cannot resurrect its images', async () => {
  const entry = await diary();
  let markPut, releasePut;
  const putStarted = new Promise(resolve => { markPut = resolve; });
  const putRelease = new Promise(resolve => { releasePut = resolve; });
  let key;
  const delayedStorage = { ...storage, async put(objectKey, bytes, mime) {
    key = objectKey;
    await storage.put(objectKey, bytes, mime);
    markPut();
    await putRelease;
  } };
  const delayedApp = createApp({ db, config, storage: delayedStorage });
  const pending = request(delayedApp).post(`/api/v1/diaries/${entry.id}/images`).set('Authorization', `Bearer ${owner.accessToken}`)
    .attach('file', png, { filename: 'photo.png', contentType: 'image/png' }).then(response => response);
  await putStarted;
  try { assert.equal((await call('delete', `/diaries/${entry.id}`)).status, 204); }
  finally { releasePut(); }
  const result = await pending;
  assert.equal(result.status, 404);
  assert.equal(await db.diaryImage.count({ where: { diaryId: entry.id } }), 0);
  await assert.rejects(access(join(config.localStoragePath, key)));
});
