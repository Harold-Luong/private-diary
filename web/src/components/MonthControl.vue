<script setup>
import Icon from './Icon.vue'
import { monthLabel, shiftMonth } from '../lib/utils'
defineProps({ modelValue: String })
defineEmits(['update:modelValue'])
</script>
<template><div class="month-control"><button class="icon-button" aria-label="Tháng trước" @click="$emit('update:modelValue', shiftMonth(modelValue, -1))"><Icon name="left" /></button><span>{{ monthLabel(modelValue) }}</span><button class="icon-button" aria-label="Tháng sau" @click="$emit('update:modelValue', shiftMonth(modelValue, 1))"><Icon name="right" /></button></div></template>
