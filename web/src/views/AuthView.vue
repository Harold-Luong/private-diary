<script setup>
import { computed, reactive, ref } from 'vue'
import { route, navigate, loginDestination } from '../lib/router'
import { signIn, session } from '../lib/api'
import Icon from '../components/Icon.vue'
import AppLink from '../components/AppLink.vue'
const register = computed(() => route.value.page === 'register')
const form = reactive({ email: '', password: '', displayName: '', confirm: '' })
const busy = ref(false), error = ref(''), show = ref(false)
async function submit() {
  if (register.value && form.password !== form.confirm) { error.value = 'Mật khẩu xác nhận chưa khớp.'; return }
  busy.value = true; error.value = ''
  try {
    const body = { email: form.email.trim(), password: form.password }
    if (register.value) { body.displayName = form.displayName.trim() || null; body.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone }
    const destination = loginDestination(route.value.query.next)
    await signIn(register.value ? 'register' : 'login', body)
    navigate(destination, { replace: true })
  } catch (e) { error.value = e.message } finally { busy.value = false }
}
</script>
<template>
  <main class="auth-layout">
    <section class="auth-story"><div class="brand"><span class="brand-mark"><Icon name="book" :size="26" /></span>một chút<span class="brand-dot">.</span></div><div class="auth-story-content"><span class="eyebrow">MỘT GÓC NHỎ, CHỈ RIÊNG BẠN</span><h1>Ghi lại hôm nay.<br />Giữ lại <em>chính mình.</em></h1><p>Những điều bình thường cũng đáng được nhớ.<br />Để cảm xúc và câu chuyện của bạn có một nơi trở về.</p><div class="paper-art" aria-hidden="true"><div class="paper-sheet"><span>gửi mình,</span><i /><i /><i /><span class="paper-flower">✳</span><small>mỗi ngày, một chút.</small></div><div class="paper-label">điều nhỏ bé, niềm vui lớn</div></div></div><div class="auth-foot"><Icon name="lock" :size="16" /> Nhật ký cá nhân · Không chia sẻ công khai</div></section>
    <section class="auth-form-side"><div class="auth-form-wrap"><span class="eyebrow">PRIVATE DIARY</span><h2>{{ register ? 'Bắt đầu câu chuyện của bạn' : 'Chào bạn trở lại.' }}</h2><p class="muted">{{ register ? 'Tạo một khoảng không cho những điều bạn muốn giữ.' : 'Một trang mới đang chờ bạn viết tiếp.' }}</p>
      <form @submit.prevent="submit" class="auth-form">
        <label v-if="register">Tên bạn<input v-model="form.displayName" maxlength="150" autocomplete="name" placeholder="Mình nên gọi bạn là gì?" /></label>
        <label>Email<input v-model="form.email" type="email" required maxlength="255" autocomplete="email" placeholder="ban@example.com" /></label>
        <label>Mật khẩu<div class="password-field"><input v-model="form.password" :type="show ? 'text' : 'password'" required :minlength="register ? 12 : 1" maxlength="128" :autocomplete="register ? 'new-password' : 'current-password'" :placeholder="register ? 'Ít nhất 12 ký tự' : 'Nhập mật khẩu của bạn'" /><button type="button" class="icon-button" :aria-label="show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'" :aria-pressed="show" @click="show = !show"><Icon name="eye" /></button></div></label>
        <label v-if="register">Xác nhận mật khẩu<input v-model="form.confirm" :type="show ? 'text' : 'password'" required autocomplete="new-password" placeholder="Nhập lại mật khẩu" /></label>
        <p v-if="error || session.error" role="alert" class="form-error">{{ error || session.error }}</p>
        <button class="button primary full" :disabled="busy">{{ busy ? 'Đang xử lý…' : register ? 'Tạo sổ nhật ký' : 'Đăng nhập' }}<Icon name="arrow" :size="18" /></button>
      </form>
      <p class="auth-switch">{{ register ? 'Bạn đã có tài khoản?' : 'Bạn chưa có tài khoản?' }} <AppLink :to="register ? '/login' : '/register'">{{ register ? 'Đăng nhập' : 'Tạo tài khoản' }}</AppLink></p>
      <div class="privacy-caption"><Icon name="lock" :size="15" /><span>Chỉ tài khoản của bạn có thể truy cập nhật ký.</span></div>
    </div></section>
  </main>
</template>
