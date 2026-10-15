import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { backendLauncherPlugin } from './vite-backend-launcher.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    backendLauncherPlugin(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            if (res.writeHead && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                status: 'ERROR',
                detail: 'Backend server is currently initializing or reconnecting. Please retry in a few moments.'
              }));
            }
          });
        },
      },
    },
  },
})
