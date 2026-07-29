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
    // MediaPipe's WASM loader uses a custom Module factory that breaks when
    // Vite pre-bundles it — exclude it so the worker gets the raw ESM files.
    exclude: ['@mediapipe/tasks-vision'],
  },
  worker: {
    // IIFE (classic) format is required for MediaPipe WASM workers.
    // MediaPipe's vision_wasm_internal.js is a UMD script that relies on
    // classic global-scope execution. Only classic workers support importScripts(),
    // which is the CSP-safe way to load UMD scripts into the worker global scope.
    // ES module workers ('es' format) fundamentally cannot do this.
    format: 'iife',
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

