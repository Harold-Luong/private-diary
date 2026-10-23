import { createPinia, defineStore } from 'pinia'

export const pinia = createPinia()
// Memory only: no persistence plugin, localStorage, or sessionStorage for auth/diary data.
const useSession = defineStore('session', { state: () => ({ user: null, token: null, ready: false, error: '' }) })
export const session = useSession(pinia)
