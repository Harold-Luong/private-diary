<script setup>
import Icon from './Icon.vue'
defineProps({ loading: Boolean, error: String })
defineEmits(['retry'])
</script>
<template>
  <div v-if="loading" class="loading-state" role="status"><span class="spinner" /> Đang mở những trang viết…</div>
  <div v-else-if="error" class="error-state" role="alert"><Icon name="alert" /><p>{{ error }}</p><button class="button secondary" @click="$emit('retry')">Thử lại</button></div>
  <slot v-else />
</template>
