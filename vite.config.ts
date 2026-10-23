import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
const isVercelBuild = process.env.VERCEL === '1'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: isVercelBuild ? 'dist' : 'build',
  },
})
