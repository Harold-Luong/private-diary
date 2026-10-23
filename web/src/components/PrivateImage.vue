<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { api } from '../lib/api'
import Icon from './Icon.vue'
const props = defineProps({ image: Object })
const src = ref(''), error = ref(false)
let controller
async function load() {
  controller?.abort(); controller = new AbortController()
  const signal = controller.signal
  if (src.value) URL.revokeObjectURL(src.value)
  src.value = ''; error.value = false
  try { const blob = await api(`/diaries/${props.image.diaryId}/images/${props.image.id}/content`, { blob: true, signal }); if (!signal.aborted) src.value = URL.createObjectURL(blob) }
  catch (e) { if (e.name !== 'AbortError') error.value = true }
}
watch(() => props.image.id, load, { immediate: true })
onBeforeUnmount(() => { controller?.abort(); if (src.value) URL.revokeObjectURL(src.value) })
</script>
<template><div class="private-image"><img v-if="src" :src="src" :alt="image.originalName || 'Ảnh trong nhật ký'" /><button v-else-if="error" class="image-retry" @click="load"><Icon name="image" />Tải lại ảnh</button><span v-else class="spinner" /></div></template>
