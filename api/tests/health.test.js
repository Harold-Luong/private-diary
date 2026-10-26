import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import { createApp } from '../src/app.js';
import { createHealthController } from '../src/controllers/health.js';

test('health is public, uncached and checks the database again on each completed request', async () => {
  let calls = 0;
  const db = { $queryRaw: async () => { calls++; return [{ '?column?': 1 }]; } };
  const app = createApp({ db, config: { trustProxy: false, origins: [] } });
  for (let i = 0; i < 2; i++) {
    const response = await request(app).get('/health');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'ok', database: 'up' });
    assert.match(response.headers['cache-control'], /no-store/);
  }
  assert.equal(calls, 2);
});

test('health returns 503 for database failures without exposing error details', async () => {
  const db = { $queryRaw: async () => { throw new Error('postgresql://secret:password@private-host/db'); } };
  const app = createApp({ db, config: { trustProxy: false, origins: [] } });
  const response = await request(app).get('/health');
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { status: 'unavailable', database: 'down' });
  assert.match(response.headers['cache-control'], /no-store/);
});

test('a stalled probe times out without queuing more queries, then recovers', async () => {
  let resolveQuery, calls = 0;
  const db = { $queryRaw: () => {
    calls++;
    if (calls === 1) return new Promise(resolve => { resolveQuery = resolve; });
    return Promise.resolve([]);
  } };
  const app = express();
  app.get('/health', createHealthController(db, { timeoutMs: 20 }));
  for (let i = 0; i < 2; i++) {
    const response = await request(app).get('/health').timeout(1000);
    assert.equal(response.status, 503);
  }
  assert.equal(calls, 1);
  resolveQuery([]);
  const response = await request(app).get('/health');
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});
