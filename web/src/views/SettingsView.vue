<script setup>
import { reactive, ref, onMounted } from 'vue'
import { api, session, applyTheme, queryString } from '../lib/api'
import Icon from '../components/Icon.vue'
const form = reactive({ displayName: session.user.displayName || '', timezone: session.user.settings.timezone, theme: session.user.settings.theme })
const busy = ref(false), error = ref(''), success = ref(''), tags = ref([]), tagName = ref(''), editing = ref(null), tagError = ref(''), tagPage = ref(1), tagPages = ref(1), tagsLoading = ref(false), tagBusy = ref(false)
const zones = [...new Set([form.timezone, 'Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Tokyo', 'Asia/Singapore', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'])]
async function save() {
  busy.value = true; error.value = ''; success.value = ''
  try { session.user = (await api('/users/me', { method: 'PATCH', body: { displayName: form.displayName.trim() || null, settings: { timezone: form.timezone, theme: form.theme } } })).data; applyTheme(); success.value = 'Đã lưu cài đặt của bạn.' }
  catch (e) { error.value = e.message } finally { busy.value = false }
}
async function loadTags() {
  tagsLoading.value = true; tagError.value = ''
  try { const result = await api(`/tags?${queryString({ page: tagPage.value, limit: 20 })}`); tags.value = result.data; tagPages.value = result.meta.totalPages }
  catch (e) { tagError.value = e.message } finally { tagsLoading.value = false }
}
async function saveTag() {
  if (!tagName.value.trim() || tagBusy.value) return
  tagBusy.value = true; tagError.value = ''
  try { await api(editing.value ? `/tags/${editing.value}` : '/tags', { method: editing.value ? 'PATCH' : 'POST', body: { name: tagName.value.trim() } }); editing.value = null; tagName.value = ''; tagPage.value = 1; await loadTags() }
  catch (e) { tagError.value = e.message } finally { tagBusy.value = false }
}
async function removeTag(tag) {
  if (!window.confirm(`Xóa thẻ “${tag.name}”? Các trang nhật ký vẫn được giữ lại.`)) return
  tagBusy.value = true; tagError.value = ''
  try { await api(`/tags/${tag.id}`, { method: 'DELETE' }); if (editing.value === tag.id) { editing.value = null; tagName.value = '' } if (tags.value.length === 1 && tagPage.value > 1) tagPage.value--; await loadTags() }
  catch (e) { tagError.value = e.message } finally { tagBusy.value = false }
}
function page(offset) { tagPage.value += offset; loadTags() }
onMounted(loadTags)
</script>
<template><div class="page-heading"><div><span class="eyebrow">THEO CÁCH CỦA BẠN</span><h1>Góc cá nhân</h1><p class="muted">Một vài điều chỉnh để nơi này thật sự là của bạn.</p></div></div><div class="settings-layout"><form class="panel settings-form" @submit.prevent="save"><h2>Thông tin & sở thích</h2><label>Tên hiển thị<input v-model="form.displayName" maxlength="150" autocomplete="name" placeholder="Tên bạn" /></label><label>Email<input :value="session.user.email" type="email" disabled /><span class="hint">Email đăng nhập của tài khoản.</span></label><label>Múi giờ<select v-model="form.timezone"><option v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</option></select><span class="hint">Dùng để xác định ngày hôm nay. Ngày của nhật ký cũ không thay đổi.</span></label><fieldset class="theme-picker"><legend>Giao diện</legend><label v-for="theme in [{ value: 'LIGHT', name: 'Sáng' }, { value: 'DARK', name: 'Tối' }, { value: 'SYSTEM', name: 'Theo thiết bị' }]" :key="theme.value" :class="{ selected: form.theme === theme.value }"><input v-model="form.theme" type="radio" :value="theme.value" name="theme" />{{ theme.name }}</label></fieldset><p v-if="error" role="alert" class="form-error">{{ error }}</p><p v-if="success" role="status" class="form-success">{{ success }}</p><button class="button primary" :disabled="busy">{{ busy ? 'Đang lưu…' : 'Lưu thay đổi' }}<Icon name="check" :size="17" /></button></form><section class="panel"><h2>Những chiếc thẻ</h2><p class="muted">Sắp xếp những câu chuyện theo cách của bạn.</p><form class="inline-form tag-form" @submit.prevent="saveTag"><input v-model="tagName" maxlength="50" required :placeholder="editing ? 'Tên thẻ mới' : 'Thêm một chiếc thẻ…'" aria-label="Tên thẻ" :disabled="tagBusy" /><button class="button primary small" :disabled="tagBusy">{{ editing ? 'Lưu' : 'Thêm' }}</button><button v-if="editing" class="icon-button" type="button" aria-label="Hủy sửa thẻ" @click="editing = null; tagName = ''"><Icon name="close" :size="17" /></button></form><div v-if="tagsLoading" class="hint" role="status">Đang tải thẻ…</div><div v-for="tag in tags" :key="tag.id" class="tag-manage-row"><span><Icon name="tag" :size="16" />{{ tag.name }}</span><div><button class="icon-button" :disabled="tagBusy" :aria-label="`Sửa thẻ ${tag.name}`" @click="editing = tag.id; tagName = tag.name"><Icon name="pen" :size="16" /></button><button class="icon-button danger" :disabled="tagBusy" :aria-label="`Xóa thẻ ${tag.name}`" @click="removeTag(tag)"><Icon name="trash" :size="16" /></button></div></div><p v-if="!tagsLoading && !tags.length && !tagError" class="hint">Chưa có thẻ. Thử bắt đầu với “biết ơn” hoặc “gia đình”.</p><p v-if="tagError" role="alert" class="form-error">{{ tagError }} <button class="text-button" @click="loadTags">Tải lại</button></p><div v-if="tagPages > 1" class="pagination"><button class="icon-button" :disabled="tagPage <= 1 || tagsLoading" aria-label="Trang thẻ trước" @click="page(-1)"><Icon name="left" /></button><span>{{ tagPage }} / {{ tagPages }}</span><button class="icon-button" :disabled="tagPage >= tagPages || tagsLoading" aria-label="Trang thẻ sau" @click="page(1)"><Icon name="right" /></button></div><div class="privacy-note"><Icon name="lock" /><div><strong>Không gian riêng của bạn</strong><p>Nhật ký và ảnh chỉ hiển thị sau khi đăng nhập vào tài khoản của bạn. Ứng dụng không có tính năng chia sẻ công khai.</p></div></div></section></div></template>
