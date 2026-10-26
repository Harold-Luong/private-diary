import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onRequest } from '../functions/api/[[path]].js'

const env = { API_ORIGIN: 'https://diary-api.example.com' }

test('Pages proxy forwards auth without weakening CSRF or exposing other cookies', async t => {
  const cookie = '__Secure-diary_refresh=rotated; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax'
  const upstream = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.href, 'https://diary-api.example.com/api/v1/auth/refresh?test=1')
    assert.equal(options.method, 'POST')
    assert.equal(options.redirect, 'manual')
    assert.equal(options.headers.get('origin'), 'https://diary.pages.dev')
    assert.equal(options.headers.get('x-csrf-protection'), '1')
    assert.equal(options.headers.get('cookie'), '__Secure-diary_refresh=old')
    assert.equal(options.headers.get('x-forwarded-for'), null)
    assert.equal(options.headers.get('cf-connecting-ip'), null)
    assert.equal(await new Response(options.body).text(), '{}')
    return new Response('{"success":true}', { headers: { 'Set-Cookie': cookie, 'Content-Type': 'application/json' } })
  })
  const response = await onRequest({ env, request: new Request('https://diary.pages.dev/api/v1/auth/refresh?test=1', {
    method: 'POST', body: '{}', headers: {
      Origin: 'https://diary.pages.dev', 'X-CSRF-Protection': '1', 'Content-Type': 'application/json',
      Cookie: 'analytics=private; __Secure-diary_refresh=old; CF_Authorization=private',
      'X-Forwarded-For': '1.2.3.4', 'CF-Connecting-IP': '1.2.3.4',
    },
  }) })
  assert.equal(upstream.mock.calls.length, 1)
  assert.equal(response.headers.get('set-cookie'), cookie)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await response.json(), { success: true })
})

test('Pages proxy streams uploads and images and preserves API errors', async t => {
  const payload = new Uint8Array([0, 255, 3, 17])
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.headers.get('authorization'), 'Bearer test')
    assert.equal(options.headers.get('content-type'), 'multipart/form-data; boundary=test')
    assert.equal(options.headers.get('origin'), null)
    assert.deepEqual(new Uint8Array(await new Response(options.body).arrayBuffer()), payload)
    return new Response(payload, { status: 201, headers: { 'Content-Type': 'image/png' } })
  })
  const response = await onRequest({ env, request: new Request('https://diary.pages.dev/api/v1/diaries/id/images', {
    method: 'POST', body: payload, headers: { Authorization: 'Bearer test', 'Content-Type': 'multipart/form-data; boundary=test' },
  }) })
  assert.equal(response.status, 201)
  assert.equal(response.headers.get('content-type'), 'image/png')
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), payload)

  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false }, { status: 401 }))
  assert.equal((await onRequest({ env, request: new Request('https://diary.pages.dev/api/v1/moods') })).status, 401)
})

test('Pages proxy rejects invalid destinations and never follows upstream redirects', async t => {
  const upstream = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 302, headers: { Location: 'https://other.example' } }))
  const request = new Request('https://diary.pages.dev/api/v1/moods')
  for (const origin of [undefined, 'http://localhost:3000', 'https://user:password@api.example', 'https://api.example/api/v1', 'https://diary.pages.dev']) {
    assert.equal((await onRequest({ request, env: { API_ORIGIN: origin } })).status, 503)
  }
  assert.equal((await onRequest({ request: new Request('https://diary.pages.dev/api/other'), env })).status, 404)
  assert.equal(upstream.mock.calls.length, 0)
  assert.equal((await onRequest({ request, env })).status, 502)
  assert.equal(upstream.mock.calls.length, 1)

  t.mock.method(globalThis, 'fetch', async () => { throw new Error('private connection details') })
  const response = await onRequest({ request, env })
  assert.equal(response.status, 502)
  assert.equal((await response.text()).includes('private connection details'), false)
})
