<script setup>
import { reactive, ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api, allTags } from '../lib/api'
import { route, navigate, beforeLeave } from '../lib/router'
import { today } from '../lib/utils'
import Icon from '../components/Icon.vue'
import AppLink from '../components/AppLink.vue'
import PrivateImage from '../components/PrivateImage.vue'
import LoadState from '../components/LoadState.vue'
const entryId = ref(route.value.id), form = reactive({ title: '', content: '', diaryDate: route.value.query.date || today(), moodId: route.value.query.moodId || null, tagIds: [] })
const moods = ref([]), tags = ref([]), images = ref([]), status = ref('DRAFT')
const loading = ref(true), loadError = ref(''), error = ref(''), success = ref(''), busy = ref(false), uploadProgress = ref(''), newTag = ref(''), tagBusy = ref(false)
let snapshot = '', allowLeave = false
const dirty = computed(() => !loading.value && JSON.stringify(form) !== snapshot)
const wordCount = computed(() => form.content.trim() ? form.content.trim().split(/\s+/u).length : 0)
function leave() { return allowLeave || (!busy.value && !dirty.value) || window.confirm(busy.value ? 'Thao tác chưa hoàn tất. Bạn muốn rời trang?' : 'Bạn có nội dung chưa lưu. Rời trang sẽ mất các chỉnh sửa này.') }
const removeGuard = beforeLeave(leave)
function unload(event) { if (dirty.value || busy.value) { event.preventDefault(); event.returnValue = '' } }
window.addEventListener('beforeunload', unload)
onBeforeUnmount(() => { removeGuard(); window.removeEventListener('beforeunload', unload) })
async function load() {
  loading.value = true; loadError.value = ''
  try {
    const [m, t, entry] = await Promise.all([api('/moods'), allTags(), entryId.value ? api(`/diaries/${entryId.value}`) : null])
    moods.value = m.data; tags.value = t
    if (entry) {
      const value = entry.data
      Object.assign(form, { title: value.title || '', content: value.content, diaryDate: value.diaryDate, moodId: value.mood?.id || null, tagIds: value.tags.map(tag => tag.id) })
      images.value = value.images; status.value = value.status
    }
    if (form.moodId && !moods.value.some(m => m.id === form.moodId)) form.moodId = null
    snapshot = JSON.stringify(form)
  } catch (e) { loadError.value = e.message } finally { loading.value = false }
}
async function save(nextStatus) {
  if (busy.value) return
  error.value = ''; success.value = ''
  if (!form.diaryDate) { error.value = 'Chọn ngày cho trang viết này.'; return }
  if (nextStatus === 'PUBLISHED' && (!form.content.trim() || form.diaryDate > today())) { error.value = !form.content.trim() ? 'Hãy viết một chút nội dung trước khi lưu hoàn chỉnh.' : 'Trang hoàn chỉnh không thể có ngày trong tương lai.'; return }
  busy.value = true
  try {
    const response = await api(entryId.value ? `/diaries/${entryId.value}` : '/diaries', { method: entryId.value ? 'PATCH' : 'POST', body: { ...form, title: form.title.trim() || null, status: nextStatus } })
    snapshot = JSON.stringify(form); allowLeave = true
    await navigate(`/diaries/${response.data.id}`, { replace: true })
  } catch (e) { error.value = e.status === 0 ? `${e.message} Hãy kiểm tra sổ nhật ký trước khi gửi lại để tránh tạo trùng.` : e.message }
  finally { busy.value = false }
}
async function addTag() {
  if (!newTag.value.trim() || tagBusy.value) return
  tagBusy.value = true; error.value = ''
  try {
    const result = await api('/tags', { method: 'POST', body: { name: newTag.value.trim() } })
    tags.value.push(result.data)
    if (form.tagIds.length < 20) form.tagIds.push(result.data.id)
    newTag.value = ''
  } catch (e) { error.value = e.message } finally { tagBusy.value = false }
}
async function upload(event) {
  const files = Array.from(event.target.files || []); event.target.value = ''
  if (!files.length || busy.value) return
  error.value = ''; success.value = ''
  if (images.value.length + files.length > 10) { error.value = 'Mỗi nhật ký có tối đa 10 ảnh.'; return }
  if (files.some(f => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 10000000 || !f.size)) { error.value = 'Chọn ảnh JPEG, PNG hoặc WebP, không rỗng và tối đa 10 MB/ảnh.'; return }
  busy.value = true
  try {
    if (!entryId.value) {
      const created = await api('/diaries', { method: 'POST', body: { ...form, title: form.title.trim() || null, status: 'DRAFT' } })
      entryId.value = created.data.id; snapshot = JSON.stringify(form)
      success.value = 'Đã tạo bản nháp để lưu ảnh. Bạn có thể tìm lại trong sổ nhật ký.'
    }
    for (let i = 0; i < files.length; i++) {
      uploadProgress.value = `Đang tải ảnh ${i + 1}/${files.length}…`
      const body = new FormData(); body.append('file', files[i])
      const result = await api(`/diaries/${entryId.value}/images`, { method: 'POST', body })
      images.value.push(result.data)
    }
    success.value = 'Ảnh đã được lưu vào nhật ký.'
  } catch (e) {
    error.value = `${e.message} Các ảnh tải thành công đã được giữ lại.`
    if (entryId.value) { try { images.value = (await api(`/diaries/${entryId.value}/images`)).data } catch { /* Keep the confirmed successful images. */ } }
  } finally { busy.value = false; uploadProgress.value = '' }
}
async function removeImage(image) {
  if (!window.confirm('Xóa ảnh này khỏi nhật ký?')) return
  busy.value = true; error.value = ''
  try { await api(`/diaries/${entryId.value}/images/${image.id}`, { method: 'DELETE' }); images.value = images.value.filter(item => item.id !== image.id) }
  catch (e) { error.value = e.message } finally { busy.value = false }
}
async function moveImage(index, offset) {
  busy.value = true; error.value = ''
  const reordered = [...images.value]; [reordered[index], reordered[index + offset]] = [reordered[index + offset], reordered[index]]
  try { images.value = (await api(`/diaries/${entryId.value}/images/order`, { method: 'PATCH', body: { imageIds: reordered.map(i => i.id) } })).data }
  catch (e) { error.value = e.message; try { images.value = (await api(`/diaries/${entryId.value}/images`)).data } catch { /* Retain previous metadata. */ } }
  finally { busy.value = false }
}
onMounted(load)
</script>
<template>
  <AppLink to="/diaries" class="back-link"><Icon name="left" :size="16" /> Trở về sổ nhật ký</AppLink>
  <div class="page-heading"><div><span class="eyebrow">MỘT KHOẢNG THỜI GIAN CHO MÌNH</span><h1>{{ entryId ? 'Viết tiếp câu chuyện' : 'Hôm nay, mình muốn viết…' }}</h1></div><span class="private-badge"><Icon name="lock" :size="14" /> Chỉ mình bạn</span></div>
  <LoadState :loading="loading" :error="loadError" @retry="load"><div class="editor-layout">
    <section class="editor-paper"><label class="sr-only" for="diary-title">Tiêu đề nhật ký</label><input id="diary-title" v-model="form.title" :disabled="busy" class="title-input" maxlength="255" placeholder="Đặt tên cho ngày hôm nay…" /><div class="paper-divider" /><label class="sr-only" for="diary-content">Nội dung nhật ký</label><textarea id="diary-content" v-model="form.content" :disabled="busy" class="content-input" maxlength="100000" placeholder="Không cần những lời hoàn hảo. Bắt đầu từ điều bạn đang nghĩ…" /><div class="editor-counter"><span>{{ wordCount }} từ · {{ form.content.length.toLocaleString('vi-VN') }}/100.000 ký tự</span><span>{{ dirty ? 'Có thay đổi chưa lưu' : 'Mọi điều bắt đầu từ một dòng' }}</span></div></section>
    <aside class="editor-aside"><section class="panel"><label>Ngày của trang viết<input v-model="form.diaryDate" type="date" :disabled="busy" required /></label><div class="aside-divider" /><h3>Cảm xúc của bạn</h3><div class="editor-moods"><button v-for="mood in moods" :key="mood.id" type="button" :disabled="busy" :class="['mood-choice', { selected: form.moodId === mood.id }]" :aria-pressed="form.moodId === mood.id" @click="form.moodId = form.moodId === mood.id ? null : mood.id"><span>{{ mood.emoji }}</span><small>{{ mood.name }}</small></button></div><div class="aside-divider" /><h3>Gắn một chiếc thẻ</h3><p class="hint">Để dễ tìm lại sau này · {{ form.tagIds.length }}/20</p><div class="tag-picker"><label v-for="tag in tags" :key="tag.id" :class="['tag-option', { selected: form.tagIds.includes(tag.id) }]"><input v-model="form.tagIds" type="checkbox" :value="tag.id" :disabled="busy || (form.tagIds.length >= 20 && !form.tagIds.includes(tag.id))" />{{ tag.name }}</label></div><form class="inline-form" @submit.prevent="addTag"><input v-model="newTag" maxlength="50" placeholder="Thẻ mới…" aria-label="Tên thẻ mới" :disabled="busy || tagBusy" /><button class="icon-button" :disabled="busy || tagBusy || !newTag.trim()" aria-label="Tạo thẻ"><Icon name="plus" /></button></form></section><div class="writing-note"><span>“</span><p>Bạn không cần viết hay.<br />Chỉ cần viết thật.</p></div></aside>
    <section class="panel editor-gallery"><div class="section-heading"><div><h3>Giữ lại một khoảnh khắc</h3><p class="hint">JPEG, PNG, WebP · Tối đa 10 MB/ảnh · {{ images.length }}/10 ảnh</p></div><label class="button secondary upload-button" :class="{ disabled: busy || images.length >= 10 }"><Icon name="image" :size="17" />Thêm ảnh<input type="file" accept="image/jpeg,image/png,image/webp" multiple :disabled="busy || images.length >= 10" @change="upload" /></label></div><div v-if="images.length" class="image-grid"><div v-for="(image, index) in images" :key="image.id" class="gallery-item"><PrivateImage :image="image" /><div class="image-actions"><button class="icon-button" :disabled="busy || index === 0" aria-label="Đưa ảnh về trước" @click="moveImage(index, -1)"><Icon name="left" :size="16" /></button><button class="icon-button" :disabled="busy || index === images.length - 1" aria-label="Đưa ảnh về sau" @click="moveImage(index, 1)"><Icon name="right" :size="16" /></button><button class="icon-button danger" :disabled="busy" aria-label="Xóa ảnh" @click="removeImage(image)"><Icon name="trash" :size="16" /></button></div></div></div><p v-else class="hint">Một bức ảnh, thêm một cách để nhớ.</p><p class="hint">Ảnh được giữ nguyên, bao gồm thông tin vị trí nếu có trong file.</p><p v-if="uploadProgress" role="status">{{ uploadProgress }}</p></section>
  </div><p v-if="error" role="alert" class="form-error">{{ error }}</p><p v-if="success" role="status" class="form-success">{{ success }}</p><div class="editor-save-bar"><span><Icon name="lock" :size="15" /> Trang viết của riêng bạn</span><div class="button-row"><button class="button secondary" :disabled="busy" @click="save('DRAFT')">{{ busy ? 'Đang lưu…' : 'Lưu nháp' }}</button><button class="button primary" :disabled="busy" @click="save('PUBLISHED')"><Icon name="check" :size="17" />{{ busy ? 'Đang xử lý…' : 'Lưu hoàn chỉnh' }}</button></div></div></LoadState>
</template>
