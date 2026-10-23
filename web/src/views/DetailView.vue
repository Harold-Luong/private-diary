<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../lib/api'
import { route, navigate } from '../lib/router'
import { dateLabel, useLoad } from '../lib/utils'
import AppLink from '../components/AppLink.vue'
import Icon from '../components/Icon.vue'
import PrivateImage from '../components/PrivateImage.vue'
import LoadState from '../components/LoadState.vue'
const id = route.value.id, busy = ref(false), actionError = ref('')
const { data, loading, error, load } = useLoad(async () => (await api(`/diaries/${id}`)).data)
async function remove() {
  if (!window.confirm('Xóa trang nhật ký này? Các ảnh đính kèm cũng sẽ bị xóa và không thể khôi phục trong ứng dụng.')) return
  busy.value = true
  try { await api(`/diaries/${id}`, { method: 'DELETE' }); navigate('/diaries') }
  catch (e) { actionError.value = e.message } finally { busy.value = false }
}
onMounted(load)
</script>
<template>
  <AppLink to="/diaries" class="back-link"><Icon name="left" :size="16" /> Trở về sổ nhật ký</AppLink>
  <LoadState :loading="loading" :error="error" @retry="load"><template v-if="data"><div class="detail-toolbar"><span class="private-badge"><Icon name="lock" :size="14" />Chỉ mình bạn</span><div class="button-row"><AppLink :to="`/diaries/${id}/edit`" class="button secondary"><Icon name="pen" :size="17" />Chỉnh sửa</AppLink><button class="icon-button danger" aria-label="Xóa nhật ký" :disabled="busy" @click="remove"><Icon name="trash" /></button></div></div><article class="detail-paper"><div class="eyebrow">{{ dateLabel(data.diaryDate, { weekday: 'long' }) }}</div><h1>{{ data.title || 'Một trang chưa đặt tên' }}</h1><div class="detail-meta"><span v-if="data.mood" class="mood-pill">{{ data.mood.emoji }} {{ data.mood.name }}</span><span v-if="data.status === 'DRAFT'" class="draft-badge">Bản nháp</span><span v-for="tag in data.tags" :key="tag.id" class="tag">{{ tag.name }}</span></div><div class="paper-divider" /><div class="diary-content">{{ data.content || 'Trang viết này vẫn đang chờ những dòng đầu tiên.' }}</div><div v-if="data.images.length" class="detail-images"><PrivateImage v-for="image in data.images" :key="image.id" :image="image" /></div><div class="detail-end">✧</div></article><p v-if="actionError" role="alert" class="form-error">{{ actionError }}</p><p class="page-footnote">Một phần của bạn, được giữ lại ở đây.</p></template></LoadState>
</template>
