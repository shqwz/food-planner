import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        // Docker: backend наружу на 5001 (см. docker-compose). Локальный Flask без Docker — часто 5000.
        '/api': env.VITE_API_PROXY_TARGET || 'http://localhost:5001'
      }
    }
  }
})