import { computed, onBeforeUnmount, ref } from 'vue'
import { session } from './api'

export const today = () => {
  const parts = new Intl.DateTimeFormat('en', { timeZone: session.user?.settings?.timezone || 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = type => parts.find(p => p.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export const dateLabel = (date, options = {}) => new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'long', year: 'numeric', ...options }).format(new Date(`${date}T12:00:00`))
export const monthLabel = value => dateLabel(`${value}-01`, { day: undefined })
export function monthRange(value) {
  const [year, month] = value.split('-').map(Number)
  const last = new Date(year, month, 0).getDate()
  return { fromDate: `${value}-01`, toDate: `${value}-${last}` }
}
export function shiftMonth(value, offset) {
  const [year, month] = value.split('-').map(Number)
  const next = new Date(year, month - 1 + offset, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}
export function useLoad(loader) {
  const data = ref(null), loading = ref(true), error = ref('')
  let version = 0
  async function load() {
    const id = ++version; loading.value = true; error.value = ''
    try { const result = await loader(); if (id === version) data.value = result }
    catch (e) { if (id === version) error.value = e.message }
    finally { if (id === version) loading.value = false }
  }
  onBeforeUnmount(() => version++)
  return { data, loading, error, load }
}
export const firstName = computed(() => session.user?.displayName?.split(' ').at(-1) || 'bạn')
