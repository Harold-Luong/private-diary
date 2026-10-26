import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrationUrl } from '../src/migration-url.js';

test('migration URL accepts direct Neon and local PostgreSQL connections', () => {
    for (const url of [
        'postgresql://user:secret@ep-example.ap-southeast-1.aws.neon.tech/db?sslmode=require',
        'postgresql://user:secret@localhost:5432/test'
    ]) assert.equal(migrationUrl(url), url);
});

test('migration URL rejects the Neon transaction pooler without exposing credentials', () => {
    assert.throws(() => migrationUrl('postgresql://user:private-password@ep-example-pooler.ap-southeast-1.aws.neon.tech/db?sslmode=require'), error => {
        assert.match(error.message, /Set DATABASE_URL_UNPOOLED/);
        assert.doesNotMatch(error.message, /private-password/);
        return true;
    });
});

test('invalid migration URL reports configuration keys without exposing its value', () => {
    assert.throws(() => migrationUrl('private-password'), error => {
        assert.match(error.message, /Invalid migration database URL/);
        assert.doesNotMatch(error.message, /private-password/);
        return true;
    });
});
