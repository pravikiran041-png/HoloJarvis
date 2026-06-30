import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api/groq': {
        target: 'https://api.groq.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/groq/, '/openai/v1/chat/completions'),
      },
      '/api/command': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/command/, '/command'),
      },
      '/command': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/send-whatsapp': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/send-whatsapp/, '/send-whatsapp'),
      },
      '/phone': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      },
      '/laptop': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/remote': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/system': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
