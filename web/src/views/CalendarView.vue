<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '../lib/api'
import { today, dateLabel, useLoad } from '../lib/utils'
import AppLink from '../components/AppLink.vue'
import MonthControl from '../components/MonthControl.vue'
import LoadState from '../components/LoadState.vue'
import Icon from '../components/Icon.vue'
const month = ref(today().slice(0, 7)), status = ref(''), selected = ref(today())
const { data, loading, error, load } = useLoad(async () => { const [year, value] = month.value.split('-'); return (await api(`/diaries/calendar?year=${year}&month=${Number(value)}${status.value ? `&status=${status.value}` : ''}`)).data })
const offset = computed(() => (new Date(`${month.value}-01T12:00:00`).getDay() + 6) % 7)
const day = computed(() => data.value?.days.find(d => d.date === selected.value))
const total = computed(() => data.value?.days.reduce((n, d) => n + d.total, 0) || 0)
watch([month, status], () => { if (!selected.value.startsWith(month.value)) selected.value = `${month.value}-01`; load() })
onMounted(load)
</script>
<template><div class="page-heading"><div><span class="eyebrow">DẤU CHÂN CỦA TỪNG NGÀY</span><h1>Lịch nhật ký</h1><p class="muted">Nhìn lại những ngày bạn đã dành thời gian cho mình.</p></div><AppLink to="/diaries/new" class="button primary"><Icon name="plus" :size="18" />Viết nhật ký</AppLink></div><div class="calendar-layout"><section class="panel calendar-panel"><div class="section-heading"><MonthControl v-model="month" /><select v-model="status" aria-label="Lọc trạng thái lịch"><option value="">Tất cả trang viết</option><option value="PUBLISHED">Đã hoàn chỉnh</option><option value="DRAFT">Bản nháp</option></select></div><LoadState :loading="loading" :error="error" @retry="load"><div class="calendar-grid"><span v-for="name in ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']" :key="name" class="weekday">{{ name }}</span><span v-for="i in offset" :key="`blank-${i}`" class="calendar-blank" /><button v-for="item in data?.days" :key="item.date" :class="['calendar-day', { today: item.date === today(), selected: item.date === selected, written: item.total }]" :aria-label="`${dateLabel(item.date)}: ${item.total} trang viết`" :aria-pressed="item.date === selected" @click="selected = item.date"><span>{{ Number(item.date.slice(-2)) }}</span><small v-if="item.total">{{ item.total }} trang</small><i v-if="item.total" /></button></div><div class="calendar-legend"><span><i /> Ngày có nhật ký</span><span>{{ total }} trang viết trong tháng</span></div></LoadState></section><aside class="panel calendar-day-panel"><span class="eyebrow">NGÀY BẠN CHỌN</span><h2>{{ dateLabel(selected, { year: undefined }) }}</h2><span class="large-day">{{ selected.slice(-2) }}</span><h3>{{ day?.total ? `${day.total} trang viết đã lưu` : 'Một ngày, nhiều điều để kể.' }}</h3><p class="muted">{{ day?.total ? `${day.publishedCount} hoàn chỉnh · ${day.draftCount} bản nháp` : 'Ghi lại một điều khiến bạn mỉm cười, hoặc điều còn vương trong tâm trí.' }}</p><AppLink v-if="day?.total" :to="`/diaries?fromDate=${selected}&toDate=${selected}${status ? `&status=${status}` : ''}`" class="button secondary full">Mở trang viết <Icon name="arrow" :size="16" /></AppLink><AppLink :to="`/diaries/new?date=${selected}`" class="text-link">Viết cho ngày này <Icon name="plus" :size="16" /></AppLink></aside></div></template>
