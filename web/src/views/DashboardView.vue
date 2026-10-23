<script setup>
import { onMounted } from 'vue'
import { api, queryString } from '../lib/api'
import { today, firstName, dateLabel, monthRange, useLoad } from '../lib/utils'
import AppLink from '../components/AppLink.vue'
import Icon from '../components/Icon.vue'
import DiaryCard from '../components/DiaryCard.vue'
import LoadState from '../components/LoadState.vue'
const date = today(), month = date.slice(0, 7)
const { data, loading, error, load } = useLoad(async () => {
  const [entries, statistics, moods] = await Promise.all([api('/diaries?limit=4&sort=updatedAt:desc'), api(`/diaries/statistics?${queryString({ ...monthRange(month), status: 'ALL' })}`), api('/moods')])
  return { entries: entries.data, stats: statistics.data, total: entries.meta.total, moods: moods.data }
})
onMounted(load)
</script>
<template>
  <div class="page-heading"><div><div class="eyebrow">{{ dateLabel(date, { weekday: 'long' }) }}</div><h1>Chào {{ firstName }}, hôm nay thế nào?</h1><p class="muted">Chậm lại một chút. Lắng nghe mình một chút.</p></div><span class="heading-sun"><Icon name="sun" :size="34" /></span></div>
  <section class="welcome-banner"><div><span class="eyebrow">MỖI NGÀY LÀ MỘT TRANG MỚI</span><h2>Những điều nhỏ bé,<br />đều xứng đáng được <em>giữ lại.</em></h2><p>Một suy nghĩ thoáng qua, một niềm vui giản dị.<br />Viết cho hôm nay, và cho bạn của mai này.</p><AppLink to="/diaries/new" class="button primary"><Icon name="pen" :size="18" /> Viết một trang mới <Icon name="arrow" :size="18" /></AppLink></div><div class="banner-art" aria-hidden="true"><div class="orbit orbit-one" /><div class="orbit orbit-two" /><span class="botanical">✳</span><div class="little-note"><span>hôm nay,</span><i /><i /><small>mình biết ơn…</small></div><span class="art-spark">✧</span></div></section>
  <LoadState :loading="loading" :error="error" @retry="load"><template v-if="data">
    <div class="stat-grid"><div class="stat-card"><span class="stat-icon sage"><Icon name="book" /></span><div><span class="stat-number">{{ data.stats.totalEntries }}</span><span class="stat-label">Trang viết tháng này</span></div></div><div class="stat-card"><span class="stat-icon peach"><Icon name="calendar" /></span><div><span class="stat-number">{{ data.stats.activeDays }} <small>ngày</small></span><span class="stat-label">Dành thời gian cho mình</span></div></div><div class="stat-card"><span class="stat-icon lilac"><Icon name="pen" /></span><div><span class="stat-number">{{ data.stats.draftCount }}</span><span class="stat-label">Bản nháp đang viết</span></div></div></div>
    <section class="mood-strip"><div><h3>Bạn đang cảm thấy thế nào?</h3><p class="muted">Mọi cảm xúc đều có chỗ ở đây.</p></div><div class="mood-choices"><AppLink v-for="mood in data.moods" :key="mood.id" :to="`/diaries/new?moodId=${mood.id}`" class="mood-choice"><span>{{ mood.emoji }}</span><small>{{ mood.name }}</small></AppLink></div></section>
    <div class="section-heading"><div><span class="eyebrow">LẬT LẠI VÀI TRANG</span><h2>Những dòng gần đây</h2></div><AppLink to="/diaries" class="text-link">Xem tất cả <Icon name="arrow" :size="17" /></AppLink></div>
    <div v-if="data.entries.length" class="diary-grid"><DiaryCard v-for="entry in data.entries" :key="entry.id" :entry="entry" /></div>
    <div v-else class="empty-state"><span class="empty-symbol">✧</span><h3>Câu chuyện bắt đầu từ một dòng.</h3><p>Bạn chưa có nhật ký nào. Hãy viết điều đầu tiên bạn nghĩ đến.</p><AppLink to="/diaries/new" class="button secondary">Viết trang đầu tiên <Icon name="arrow" :size="16" /></AppLink></div>
  </template></LoadState><p class="page-footnote">Không cần một ngày đặc biệt để viết nên một trang đáng nhớ.</p>
</template>
