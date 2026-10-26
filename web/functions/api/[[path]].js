const forwardedHeaders = ['accept', 'authorization', 'content-type', 'origin', 'x-csrf-protection']

function failure(status, code, message) {
  return Response.json({ success: false, error: { code, message } }, {
    status, headers: { 'Cache-Control': 'private, no-store' },
  })
}

// Keep API requests and the host-only refresh cookie on the Pages origin.
// API_ORIGIN is a server-side binding, never a URL supplied by the caller.
export async function onRequest({ request, env }) {
  const incoming = new URL(request.url)
  if (!incoming.pathname.startsWith('/api/v1/')) {
    return failure(404, 'NOT_FOUND', 'Không tìm thấy API')
  }

  let target
  try {
    target = new URL(env.API_ORIGIN)
    if (target.protocol !== 'https:' || target.username || target.password ||
        target.pathname !== '/' || target.search || target.hash || target.origin === incoming.origin) throw new Error()
  } catch {
    return failure(503, 'API_NOT_CONFIGURED', 'Chưa cấu hình máy chủ API')
  }
  target.pathname = incoming.pathname
  target.search = incoming.search

  // Do not forward browser-controlled proxy/IP headers or unrelated cookies.
  // Preserve Origin and CSRF headers so the API can validate them itself.
  const headers = new Headers()
  for (const name of forwardedHeaders) {
    if (request.headers.has(name)) headers.set(name, request.headers.get(name))
  }
  const cookies = (request.headers.get('cookie') || '').split(';').map(value => value.trim())
    .filter(value => value.startsWith('__Secure-diary_refresh='))
  if (cookies.length) headers.set('cookie', cookies.join('; '))

  try {
    const upstream = await fetch(target, {
      method: request.method, headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    })
    // Never send credentials to a redirected host or let the browser bypass this proxy.
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel()
      return failure(502, 'API_REDIRECT', 'Máy chủ API chuyển hướng không hợp lệ')
    }
    const response = new Response(upstream.body, upstream)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch {
    return failure(502, 'API_UNAVAILABLE', 'Không thể kết nối máy chủ API. Vui lòng thử lại sau.')
  }
}
