<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '../lib/api'
import { today, dateLabel, useLoad } from '../lib/utils'
import { vietnameseLunarDate, lunarDayLabel, lunarDateLabel } from '../lib/lunar'
import AppLink from '../components/AppLink.vue'
import MonthControl from '../components/MonthControl.vue'
import LoadState from '../components/LoadState.vue'
import Icon from '../components/Icon.vue'
const month = ref(today().slice(0, 7)), status = ref(''), selected = ref(today())
const { data, loading, error, load } = useLoad(async () => { const [year, value] = month.value.split('-'); return (await api(`/diaries/calendar?year=${year}&month=${Number(value)}${status.value ? `&status=${status.value}` : ''}`)).data })
const offset = computed(() => (new Date(`${month.value}-01T12:00:00`).getDay() + 6) % 7)
const days = computed(() => (data.value?.days || []).map(item => ({ ...item, lunar: vietnameseLunarDate(item.date) })))
const day = computed(() => data.value?.days.find(d => d.date === selected.value))
const selectedLunar = computed(() => vietnameseLunarDate(selected.value))
const total = computed(() => data.value?.days.reduce((n, d) => n + d.total, 0) || 0)
function dayLabel(item) {
  const lunar = item.lunar ? `; Âm lịch: ${lunarDateLabel(item.lunar)}` : ''
  return `${dateLabel(item.date)}${lunar}: ${item.total} trang viết`
}
watch([month, status], () => { if (!selected.value.startsWith(month.value)) selected.value = `${month.value}-01`; load() })
onMounted(load)
</script>

<template>
  <div class="page-heading">
    <div><span class="eyebrow">DẤU CHÂN CỦA TỪNG NGÀY</span><h1>Lịch nhật ký</h1><p class="muted">Nhìn lại những ngày bạn đã dành thời gian cho mình.</p></div>
    <AppLink to="/diaries/new" class="button primary"><Icon name="plus" :size="18" />Viết nhật ký</AppLink>
  </div>
  <div class="calendar-layout">
    <section class="panel calendar-panel">
      <div class="section-heading">
        <MonthControl v-model="month" />
        <select v-model="status" aria-label="Lọc trạng thái lịch"><option value="">Tất cả trang viết</option><option value="PUBLISHED">Đã hoàn chỉnh</option><option value="DRAFT">Bản nháp</option></select>
      </div>
      <p class="calendar-lunar-guide">Ngày dương ở trên · Ngày âm ở dưới · N: tháng nhuận</p>
      <LoadState :loading="loading" :error="error" @retry="load">
        <div class="calendar-grid">
          <span v-for="name in ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']" :key="name" class="weekday">{{ name }}</span>
          <span v-for="i in offset" :key="`blank-${i}`" class="calendar-blank" />
          <button
            v-for="item in days" :key="item.date"
            :class="['calendar-day', { today: item.date === today(), selected: item.date === selected, written: item.total }]"
            :aria-label="dayLabel(item)" :aria-pressed="item.date === selected"
            :title="item.lunar ? `Âm lịch: ${lunarDateLabel(item.lunar)}` : undefined"
            @click="selected = item.date"
          >
            <span>{{ Number(item.date.slice(-2)) }}</span>
            <small v-if="item.lunar" :class="['lunar-date', { 'lunar-milestone': [1, 15].includes(item.lunar.day) }]">{{ lunarDayLabel(item.lunar, item.date.endsWith('-01')) }}</small>
            <small v-if="item.total" class="calendar-entry-count">{{ item.total }} trang</small>
            <i v-if="item.total" />
          </button>
        </div>
        <div class="calendar-legend"><span><i /> Ngày có nhật ký</span><span>{{ total }} trang viết trong tháng</span></div>
      </LoadState>
    </section>
    <aside class="panel calendar-day-panel">
      <span class="eyebrow">NGÀY BẠN CHỌN</span>
      <h2>{{ dateLabel(selected, { year: undefined }) }}</h2>
      <span class="large-day">{{ selected.slice(-2) }}</span>
      <div v-if="selectedLunar" class="selected-lunar-date">
        <span class="eyebrow">ÂM LỊCH VIỆT NAM</span>
        <p>{{ lunarDateLabel(selectedLunar) }}</p>
      </div>
      <p v-else class="hint">Âm lịch hỗ trợ các năm 1800–2199.</p>
      <h3>{{ day?.total ? `${day.total} trang viết đã lưu` : 'Một ngày, nhiều điều để kể.' }}</h3>
      <p class="muted">{{ day?.total ? `${day.publishedCount} hoàn chỉnh · ${day.draftCount} bản nháp` : 'Ghi lại một điều khiến bạn mỉm cười, hoặc điều còn vương trong tâm trí.' }}</p>
      <AppLink v-if="day?.total" :to="`/diaries?fromDate=${selected}&toDate=${selected}${status ? `&status=${status}` : ''}`" class="button secondary full">Mở trang viết <Icon name="arrow" :size="16" /></AppLink>
      <AppLink :to="`/diaries/new?date=${selected}`" class="text-link">Viết cho ngày này <Icon name="plus" :size="16" /></AppLink>
    </aside>
  </div>
</template>

<style scoped>
.calendar-lunar-guide { margin: -5px 0 12px; color: var(--muted); font-size: 11px; }
.calendar-day { min-width: 0; min-height: 90px; aspect-ratio: auto; padding: 8px 2px; gap: 5px; }
.calendar-day .lunar-date { font-size: 11px; line-height: 1.2; white-space: nowrap; }
.calendar-day .lunar-milestone { color: var(--green); font-weight: 600; }
.calendar-day.selected .lunar-date { color: inherit; }
.calendar-entry-count { line-height: 1.2; }
.selected-lunar-date { border-top: 1px solid var(--line); padding-top: 16px; margin-bottom: 22px; }
.selected-lunar-date p { color: var(--green); font-size: 14px; margin: 8px 0 0; }
@media (max-width: 480px) {
  .calendar-day { min-height: 76px; gap: 4px; }
  .calendar-day .lunar-date { font-size: 10px; }
  .calendar-lunar-guide { font-size: 10px; }
}
</style>
