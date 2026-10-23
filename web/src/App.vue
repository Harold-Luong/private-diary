<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { route, navigate, loginDestination } from './lib/router'
import { session, initialize, signOut } from './lib/api'
import Icon from './components/Icon.vue'
import AppLink from './components/AppLink.vue'
const AuthView = defineAsyncComponent(() => import('./views/AuthView.vue'))
import { RouterView } from 'vue-router'
const menu = [{ page: 'dashboard', to: '/dashboard', icon: 'home', label: 'Góc của mình' }, { page: 'diaries', to: '/diaries', icon: 'book', label: 'Sổ nhật ký' }, { page: 'calendar', to: '/calendar', icon: 'calendar', label: 'Lịch nhật ký' }, { page: 'statistics', to: '/statistics', icon: 'chart', label: 'Nhìn lại' }]
const mobileOpen = ref(false), logoutBusy = ref(false), logoutError = ref('')
const authPage = computed(() => ['login', 'register'].includes(route.value.page))
const activePage = computed(() => ['editor', 'detail'].includes(route.value.page) ? 'diaries' : route.value.page)
const currentTitle = computed(() => menu.find(item => item.page === activePage.value)?.label || 'Góc cá nhân')
const initials = computed(() => (session.user?.displayName || session.user?.email || 'B').slice(0, 1).toUpperCase())
watch([() => route.value.path, () => session.user, () => session.ready], () => {
  mobileOpen.value = false
  if (!session.ready) return
  if (!session.user && !authPage.value) navigate(`/login?next=${encodeURIComponent(route.value.path + window.location.search)}`, { replace: true, force: true })
  if (session.user && authPage.value) navigate(loginDestination(route.value.query.next), { replace: true })
  document.title = `${authPage.value ? (route.value.page === 'login' ? 'Đăng nhập' : 'Tạo tài khoản') : currentTitle.value} · một chút`
})
async function logout() {
  if (route.value.page === 'editor' && !window.confirm('Đăng xuất? Hãy lưu các thay đổi trước khi rời trang.')) return
  logoutBusy.value = true; logoutError.value = ''
  try { await signOut(); navigate('/login', { force: true }) }
  catch (e) { logoutError.value = e.message } finally { logoutBusy.value = false }
}
onMounted(initialize)
</script>

<template>
  <div v-if="!session.ready" class="boot-screen"><span class="brand-mark"><Icon name="book" :size="30" /></span><h1>một chút.</h1><span class="spinner" /><p>Đang mở góc nhỏ của bạn…</p></div>
  <AuthView v-else-if="!session.user" :key="route.page" />
  <div v-else class="app-shell">
    <a href="#main-content" class="skip-link">Đến nội dung chính</a>
    <button v-if="mobileOpen" class="sidebar-overlay" aria-label="Đóng menu" @click="mobileOpen = false" />
    <aside :class="['sidebar', { open: mobileOpen }]">
      <AppLink to="/dashboard" class="brand"><span class="brand-mark"><Icon name="book" :size="25" /></span>một chút<span class="brand-dot">.</span></AppLink>
      <div class="sidebar-intro">MỘT NƠI ĐỂ LÀ CHÍNH MÌNH</div>
      <AppLink to="/diaries/new" class="button primary sidebar-write"><Icon name="plus" :size="18" />Viết nhật ký</AppLink>
      <nav aria-label="Điều hướng chính"><AppLink v-for="item in menu" :key="item.page" :to="item.to" :class="['nav-item', { active: activePage === item.page }]" :aria-current="activePage === item.page ? 'page' : undefined"><Icon :name="item.icon" />{{ item.label }}<span v-if="activePage === item.page" class="nav-dot" /></AppLink></nav>
      <div class="sidebar-quote"><span>“</span><p>Mỗi ngày một chút,<br />hiểu mình hơn một chút.</p><i /></div>
      <div class="sidebar-bottom"><AppLink to="/settings" :class="['nav-item', { active: activePage === 'settings' }]"><Icon name="settings" />Cài đặt</AppLink><button class="nav-item logout" :disabled="logoutBusy" @click="logout"><Icon name="logout" />{{ logoutBusy ? 'Đang đăng xuất…' : 'Đăng xuất' }}</button><p v-if="logoutError" class="form-error" role="alert">{{ logoutError }}</p><div class="sidebar-profile"><div class="avatar">{{ initials }}</div><div><strong>{{ session.user.displayName || 'Người viết nhật ký' }}</strong><span>Góc nhỏ của riêng bạn</span></div><Icon name="lock" :size="15" /></div></div>
    </aside>
    <div class="workspace"><header class="topbar"><div class="topbar-left"><button class="icon-button mobile-menu" aria-label="Mở menu" :aria-expanded="mobileOpen" @click="mobileOpen = !mobileOpen"><Icon name="menu" /></button><span class="breadcrumb">Không gian của bạn <span>/</span> <strong>{{ currentTitle }}</strong></span></div><div class="topbar-right"><span class="private-indicator"><i />Riêng tư, luôn là vậy</span><AppLink to="/settings" class="avatar small-avatar" aria-label="Mở hồ sơ cá nhân">{{ initials }}</AppLink></div></header>
      <main id="main-content" class="main-content"><RouterView :key="route.path + JSON.stringify(route.query)" /></main>
      <footer class="workspace-footer"><span>một chút. <span class="footer-separator">/</span> không gian cho những điều riêng tư</span><span>Viết cho mình, mỗi ngày.</span></footer>
    </div>
  </div>
</template>
