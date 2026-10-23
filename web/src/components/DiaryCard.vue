<script setup>
import Icon from './Icon.vue'
import AppLink from './AppLink.vue'
import { dateLabel } from '../lib/utils'
defineProps({ entry: Object })
</script>
<template>
  <AppLink :to="`/diaries/${entry.id}`" class="diary-card">
    <div class="card-top"><span class="eyebrow">{{ dateLabel(entry.diaryDate, { year: undefined }) }}</span><span class="mood-emoji" :title="entry.mood?.name">{{ entry.mood?.emoji || '✧' }}</span></div>
    <h3>{{ entry.title || 'Một trang chưa đặt tên' }}</h3>
    <p class="excerpt">{{ entry.excerpt || 'Một khoảng trống đang chờ câu chuyện của bạn.' }}</p>
    <div class="card-bottom"><div class="tags"><span v-for="tag in entry.tags.slice(0, 2)" :key="tag.id" class="tag">{{ tag.name }}</span><span v-if="entry.status === 'DRAFT'" class="draft-badge">Bản nháp</span></div><span v-if="entry.imageCount" class="image-count"><Icon name="image" :size="15" />{{ entry.imageCount }}</span><Icon v-else name="arrow" :size="17" /></div>
  </AppLink>
</template>
