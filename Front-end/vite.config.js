import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Custom plugin: suppress the missing source-map warning from @mediapipe/tasks-vision.
// The package ships without its .map file but leaves a sourceMappingURL comment,
// which causes a harmless but very noisy Vite warning on every hot reload.
function suppressMediapipeSourceMapWarning() {
  return {
    name: 'suppress-mediapipe-sourcemap-warning',
    enforce: 'pre',
    configResolved(config) {
      const originalWarn = config.logger.warn
      config.logger.warn = (msg, ...args) => {
        if (
          typeof msg === 'string' &&
          msg.includes('@mediapipe/tasks-vision') &&
          msg.includes('source map')
        ) {
          return // silently drop the warning
        }
        originalWarn.call(config.logger, msg, ...args)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    suppressMediapipeSourceMapWarning(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    // MediaPipe is loaded from the public/ worker via importScripts() at runtime.
    // Excluding it here prevents Vite from accidentally pre-bundling stray references.
    exclude: ['@mediapipe/tasks-vision'],
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
