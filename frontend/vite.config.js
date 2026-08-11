import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 5173 = FishAI, 5174 = other — pin this app to its own port
  server: {
    port: 5175,
    strictPort: true,
    // Same-origin proxy: the browser talks to :5175 only; the backend lives
    // on 3005 (3000 belongs to PropPicks).
    proxy: {
      '/api': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
    },
  },
})
