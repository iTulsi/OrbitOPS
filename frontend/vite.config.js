import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 850,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-core': [
            'react',
            'react-dom',
            'react-router-dom',
          ],
          'three-core': [
            'three',
            '@react-three/fiber',
          ],
          'three-helpers': [
            '@react-three/drei',
          ],
          'motion-vendor': [
            'framer-motion',
          ],
          'charts-vendor': [
            'recharts',
          ],
          'realtime-vendor': [
            'socket.io-client',
          ],
          'icons-vendor': [
            'lucide-react',
          ],
        },
      },
    },
  },
})
