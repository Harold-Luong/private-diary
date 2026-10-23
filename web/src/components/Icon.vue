<script setup>
defineProps({ name: String, size: { default: 20 } })
const paths = {
  book: 'M4 3h6a3 3 0 0 1 3 3v15a4 4 0 0 0-4-2H4V3Zm16 0h-4a3 3 0 0 0-3 3v15a4 4 0 0 1 4-2h3V3Z',
  home: 'm3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',
  calendar: 'M4 5h16v16H4V5Zm0 5h16M8 3v4m8-4v4M8 14h2m4 0h2m-8 3h2',
  chart: 'M4 3v18h17M8 16v-4m5 4V7m5 9v-6',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM10 3h4l1 3 3 1 3 3v4l-3 3-3 1-1 3h-4l-1-3-3-1-3-3v-4l3-3 3-1 1-3Z',
  plus: 'M12 5v14M5 12h14', search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',
  arrow: 'M4 12h16m-6-6 6 6-6 6', left: 'm14 6-6 6 6 6', right: 'm10 6 6 6-6 6',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10Zm7 4v3',
  pen: 'm15 3 6 6-12 12H3v-6L15 3Zm-2 2 6 6', logout: 'M9 4H4v16h5m5-13 5 5-5 5m-6-5h11',
  image: 'M3 3h18v18H3V3Zm0 13 5-5 5 5 3-3 5 5M15 7h.01',
  trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  close: 'm6 6 12 12M6 18 18 6', check: 'm5 12 4 4L19 6', menu: 'M4 6h16M4 12h16M4 18h16',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
  tag: 'M3 3h8l10 10-8 8L3 11V3Zm5 5h.01', alert: 'm12 3 10 18H2L12 3Zm0 6v5m0 3h.01',
  heart: 'M12 20 3 11a5 5 0 0 1 9-6 5 5 0 0 1 9 6l-9 9Z', eye: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
}
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.book" /></svg></template>
