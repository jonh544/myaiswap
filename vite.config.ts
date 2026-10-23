import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { handleRealtimeTokenRequest } from './api/fal/realtime-token.ts'

// https://vite.dev/config/
const isVercelBuild = process.env.VERCEL === '1'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      {
        name: 'fal-realtime-token-dev-api',
        configureServer(server) {
          server.middlewares.use('/api/fal/realtime-token', (request, response, next) => {
            void handleRealtimeTokenRequest(request, response, env.FAL_KEY ?? process.env.FAL_KEY)
              .catch(next)
          })
        },
      },
    ],
    server: {
      port: 3000,
      strictPort: true,
    },
    build: {
      outDir: isVercelBuild ? 'dist' : 'build',
    },
  }
})
