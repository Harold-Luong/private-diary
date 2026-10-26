import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvironment } from '../src/env.js';

test('root Neon env overrides API defaults while preserving runtime overrides', t => {
    const dir = mkdtempSync(join(tmpdir(), 'diary-env-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const root = join(dir, 'root.env'), api = join(dir, 'api.env');
    writeFileSync(root, 'DATABASE_URL=postgres://pooled\nDATABASE_URL_UNPOOLED=postgres://direct\n');
    writeFileSync(api, 'DATABASE_URL=postgres://local\nPORT=3000\nJWT_SECRET=local-key\n');
    const env = loadEnvironment({ env: { PORT: '3100' }, paths: [root, api] });
    assert.equal(env.DATABASE_URL, 'postgres://pooled');
    assert.equal(env.DATABASE_URL_UNPOOLED, 'postgres://direct');
    assert.equal(env.PORT, '3100');
    assert.equal(env.JWT_SECRET, 'local-key');

    const testEnv = loadEnvironment({ env: { DATABASE_URL: 'postgres://test' }, paths: [root, api] });
    assert.equal(testEnv.DATABASE_URL, 'postgres://test');
    assert.equal(testEnv.DATABASE_URL_UNPOOLED, undefined);
    const deployed = loadEnvironment({ env: { DATABASE_URL: 'postgres://runtime', DATABASE_URL_UNPOOLED: 'postgres://runtime-direct' }, paths: [root] });
    assert.equal(deployed.DATABASE_URL_UNPOOLED, 'postgres://runtime-direct');
});
