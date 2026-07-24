import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    // MediaPipe's WASM loader uses a custom Module factory that breaks when
    // Vite pre-bundles it — exclude it so the worker gets the raw ESM files.
    exclude: ['@mediapipe/tasks-vision'],
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@monaco-editor')) return 'monaco';
            if (id.includes('react/') || id.includes('react-dom') || id.includes('react-router-dom')) return 'react';
            if (id.includes('recharts')) return 'recharts';
            if (id.includes('@reduxjs') || id.includes('react-redux') || id.includes('redux-persist')) return 'redux';
            if (id.includes('axios') || id.includes('sweetalert2') || id.includes('framer-motion')) return 'vendor';
            return 'dependencies';
          }
        }
      }
    }
  }
})

