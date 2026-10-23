import { session } from '../stores/session'
export { session }

const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')
let refreshPromise
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('private-diary-session') : null
function accept(data) { session.token = data.accessToken; session.user = data.user; session.error = ''; applyTheme() }
export function clearSession(broadcast = true) {
  session.token = null; session.user = null
  if (broadcast) channel?.postMessage({ type: 'logout' })
}
channel?.addEventListener('message', ({ data }) => {
  if (data.type === 'session') accept(data.value)
  if (data.type === 'logout') clearSession(false)
})

export class ApiError extends Error {
  constructor(message, code, status, details) { super(message); this.code = code; this.status = status; this.details = details }
}
async function send(path, { method = 'GET', body, signal, token = session.token, blob = false } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (path.startsWith('/auth/')) headers['X-CSRF-Protection'] = '1'
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json'
  let response
  try {
    response = await fetch(`${base}${path}`, { method, headers, credentials: 'include', signal, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new ApiError('Không thể kết nối máy chủ. Hãy kiểm tra kết nối và thử lại.', 'NETWORK_ERROR', 0)
  }
  if (response.ok && blob) return response.blob()
  if (response.status === 204) return null
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status === 429 ? 'Bạn thao tác hơi nhanh. Vui lòng chờ một chút rồi thử lại.' : payload?.error?.message || 'Máy chủ chưa sẵn sàng. Vui lòng thử lại.', payload?.error?.code, response.status, payload?.error?.details)
  if (!payload?.success) throw new ApiError('Phản hồi máy chủ không hợp lệ.', 'INVALID_RESPONSE', response.status)
  return payload
}
export async function refreshSession() {
  if (!refreshPromise) {
    const refresh = async () => {
      // Across tabs, serialize cookie rotation. Each refresh reads the latest browser cookie.
      try {
        const result = await send('/auth/refresh', { method: 'POST', token: null })
        accept(result.data); channel?.postMessage({ type: 'session', value: result.data })
      } catch (error) { if (error.status === 401) clearSession(); throw error }
    }
    refreshPromise = (navigator.locks ? navigator.locks.request('private-diary-refresh', refresh) : refresh()).finally(() => { refreshPromise = null })
  }
  return refreshPromise
}
export async function api(path, options = {}) {
  try { return await send(path, options) }
  catch (error) {
    if (error.code === 'ACCESS_TOKEN_EXPIRED') {
      await refreshSession()
      return send(path, options)
    }
    if (error.status === 401 && !path.startsWith('/auth/')) clearSession()
    throw error
  }
}
export async function signIn(mode, body) {
  const result = await send(`/auth/${mode}`, { method: 'POST', body, token: null })
  accept(result.data); channel?.postMessage({ type: 'session', value: result.data })
}
export async function signOut() { await api('/auth/logout', { method: 'POST' }); clearSession() }
export async function initialize() {
  session.ready = false; session.error = ''
  try { await refreshSession() } catch (error) { if (error.status !== 401) session.error = error.message }
  finally { session.ready = true }
}
export function applyTheme() {
  const setting = session.user?.settings?.theme || 'SYSTEM'
  document.documentElement.dataset.theme = setting === 'DARK' || (setting === 'SYSTEM' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme)
export function queryString(values) {
  return new URLSearchParams(Object.entries(values).filter(([, value]) => value !== '' && value !== undefined && value !== null)).toString()
}
export async function allTags() {
  const items = []
  for (let page = 1; ; page++) {
    const response = await api(`/tags?page=${page}&limit=50`)
    items.push(...response.data)
    if (page >= response.meta.totalPages) return items
  }
}
