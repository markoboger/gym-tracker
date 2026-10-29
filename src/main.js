import { createApp } from 'vue'
import App from './App.vue'
import { registerSW } from 'virtual:pwa-register'

createApp(App).mount('#app')

// Register service worker for PWA
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('Neue Version verfügbar! Jetzt aktualisieren?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('[HappyFit] App ready for offline use')
  }
})
