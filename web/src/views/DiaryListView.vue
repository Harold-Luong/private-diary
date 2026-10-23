<script setup>
import { ref, reactive, onMounted } from 'vue'
import { api, allTags, queryString } from '../lib/api'
import { route, navigate } from '../lib/router'
import { useLoad } from '../lib/utils'
import Icon from '../components/Icon.vue'
import AppLink from '../components/AppLink.vue'
import DiaryCard from '../components/DiaryCard.vue'
import LoadState from '../components/LoadState.vue'
const filters = reactive({ keyword: route.value.query.keyword || '', status: route.value.query.status || '', moodId: '', tagId: '', fromDate: route.value.query.fromDate || '', toDate: route.value.query.toDate || '', sort: 'diaryDate:desc' })
const page = ref(1), moods = ref([]), tags = ref([]), filterError = ref('')
const { data, loading, error, load } = useLoad(() => api(`/diaries?${queryString({ ...filters, keyword: filters.keyword.trim(), page: page.value, limit: 12 })}`))
async function apply() { if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) { filterError.value = 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.'; return } filterError.value = ''; page.value = 1; await load() }
function clear() { Object.assign(filters, { keyword: '', status: '', moodId: '', tagId: '', fromDate: '', toDate: '', sort: 'diaryDate:desc' }); apply() }
async function changePage(offset) { page.value += offset; await load(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
onMounted(async () => { load(); try { [moods.value, tags.value] = await Promise.all([api('/moods').then(r => r.data), allTags()]) } catch (e) { filterError.value = e.message } })
</script>
<template>
  <div class="page-heading"><div><span class="eyebrow">NHỮNG MẢNH GHÉP CỦA BẠN</span><h1>Sổ nhật ký</h1><p class="muted">Từng trang viết, một phần của hành trình.</p></div><AppLink to="/diaries/new" class="button primary"><Icon name="plus" :size="18" /> Viết nhật ký</AppLink></div>
  <form class="filter-panel" @submit.prevent="apply"><div class="filter-search"><Icon name="search" /><input v-model="filters.keyword" maxlength="200" aria-label="Tìm nhật ký" placeholder="Tìm một kỷ niệm, một suy nghĩ…" /><button class="button secondary" type="submit">Tìm kiếm</button></div><div class="filter-row"><label>Trạng thái<select v-model="filters.status"><option value="">Tất cả trang viết</option><option value="PUBLISHED">Đã lưu hoàn chỉnh</option><option value="DRAFT">Bản nháp</option></select></label><label>Cảm xúc<select v-model="filters.moodId"><option value="">Mọi cảm xúc</option><option v-for="m in moods" :value="m.id" :key="m.id">{{ m.emoji }} {{ m.name }}</option></select></label><label>Thẻ<select v-model="filters.tagId"><option value="">Tất cả thẻ</option><option v-for="tag in tags" :key="tag.id" :value="tag.id">{{ tag.name }}</option></select></label><label>Từ ngày<input v-model="filters.fromDate" type="date" /></label><label>Đến ngày<input v-model="filters.toDate" type="date" /></label></div><div class="filter-bottom"><label class="sort-label">Sắp xếp<select v-model="filters.sort"><option value="diaryDate:desc">Ngày mới nhất</option><option value="diaryDate:asc">Ngày cũ nhất</option><option value="updatedAt:desc">Vừa chỉnh sửa</option></select></label><div class="button-row"><button type="button" class="text-button" @click="clear">Xóa bộ lọc</button><button class="button primary small" type="submit">Áp dụng</button></div></div><p v-if="filterError" class="form-error" role="alert">{{ filterError }}</p></form>
  <LoadState :loading="loading" :error="error" @retry="load"><template v-if="data"><div class="results-line">{{ data.meta.total }} trang viết <span>Những điều bạn đã giữ lại</span></div><div v-if="data.data.length" class="diary-grid"><DiaryCard v-for="entry in data.data" :key="entry.id" :entry="entry" /></div><div v-else class="empty-state"><Icon name="book" :size="36" /><h3>Chưa có trang viết nào ở đây.</h3><p>Thử thay đổi bộ lọc hoặc bắt đầu một câu chuyện mới.</p><button class="button secondary" @click="clear">Xóa bộ lọc</button></div><div v-if="data.meta.totalPages > 1" class="pagination"><button class="button secondary" :disabled="page === 1" @click="changePage(-1)"><Icon name="left" :size="16" />Trước</button><span>Trang {{ page }} / {{ data.meta.totalPages }}</span><button class="button secondary" :disabled="page >= data.meta.totalPages" @click="changePage(1)">Sau<Icon name="right" :size="16" /></button></div></template></LoadState>
</template>
