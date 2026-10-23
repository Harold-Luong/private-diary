import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { router } from './lib/router'
import { pinia } from './stores/session'

const app = createApp(App)
app.use(pinia)
app.use(router)
router.isReady().then(() => app.mount('#app'))
