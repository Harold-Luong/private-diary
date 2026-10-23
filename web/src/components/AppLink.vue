<script setup>
import { navigate } from '../lib/router'
defineProps({ to: { type: String, required: true } })
function follow(event, to) { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); navigate(to) } }
</script>
<template><a :href="to" @click="follow($event, to)"><slot /></a></template>
