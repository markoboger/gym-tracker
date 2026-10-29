import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/gym-tracker/' : '/',
  plugins: [vue()],
  server: {
    port: 5874,
    host: true,
    headers: {
      'Cache-Control': 'no-store'
    }
  }
}))
