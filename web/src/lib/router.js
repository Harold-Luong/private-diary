import { computed } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

const paths = [
  ['/dashboard', 'dashboard'], ['/diaries', 'diaries'], ['/diaries/new', 'editor'],
  ['/diaries/:id/edit', 'editor'], ['/diaries/:id', 'detail'], ['/calendar', 'calendar'],
  ['/statistics', 'statistics'], ['/settings', 'settings'], ['/login', 'login'], ['/register', 'register'],
]
const components = {
  dashboard: () => import('../views/DashboardView.vue'), diaries: () => import('../views/DiaryListView.vue'),
  editor: () => import('../views/EditorView.vue'), detail: () => import('../views/DetailView.vue'),
  calendar: () => import('../views/CalendarView.vue'), statistics: () => import('../views/StatisticsView.vue'),
  settings: () => import('../views/SettingsView.vue'), login: () => import('../views/AuthView.vue'), register: () => import('../views/AuthView.vue'),
}
export const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', redirect: '/dashboard' }, ...paths.map(([path, page]) => ({ path, name: path, component: components[page], meta: { page } })), { path: '/:pathMatch(.*)*', component: () => import('../views/NotFoundView.vue'), meta: { page: 'not-found' } }],
  scrollBehavior: () => ({ top: 0 }),
})
export const route = computed(() => ({ path: router.currentRoute.value.path, query: router.currentRoute.value.query, page: router.currentRoute.value.meta.page, id: router.currentRoute.value.params.id || null }))
let leaveGuard = null, skipGuard = false
export function beforeLeave(guard) { leaveGuard = guard; return () => { if (leaveGuard === guard) leaveGuard = null } }
router.beforeEach(() => { if (skipGuard) { skipGuard = false; return true } return leaveGuard ? leaveGuard() : true })
export function navigate(path, { replace = false, force = false } = {}) {
  if (!path.startsWith('/') || path.startsWith('//')) return Promise.resolve(false)
  if (path === router.currentRoute.value.fullPath) return Promise.resolve(true)
  if (force) skipGuard = true
  return router[replace ? 'replace' : 'push'](path)
}

export function loginDestination(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !/^\/(login|register)(?:[/?#]|$)/.test(next) ? next : '/dashboard'
}
