import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/n8n': {
        target: 'https://sudhanshunaik647.app.n8n.cloud',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/n8n/, ''),
        secure: true,
        timeout: 120000,
        proxyTimeout: 120000,
      },
    },
  },
})
