import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Suppress the harmless missing source-map warning from @mediapipe/tasks-vision.
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
        ) return
        originalWarn.call(config.logger, msg, ...args)
      }
    },
  }
}

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
    // MediaPipe WASM is loaded at runtime in the web worker via CDN importScripts.
    // Excluding it here prevents Vite from pre-bundling stray references.
    exclude: ['@mediapipe/tasks-vision'],
  },

  build: {
    // Raise the inline-asset threshold slightly so small icons/svgs are inlined.
    assetsInlineLimit: 4096,

    // Enable CSS code-splitting — each lazy-loaded route only loads its own CSS.
    cssCodeSplit: true,

    rollupOptions: {
      output: {
        // ── Manual chunk splitting strategy ──────────────────────────────────
        // Goal: keep the critical first-paint bundle (react + router) small;
        // push heavy libs into their own cache-friendly chunks.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          // React core — loaded first, cached aggressively
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router') ||
            id.includes('/react-router-dom/')
          ) return 'react'

          // Redux ecosystem
          if (
            id.includes('/@reduxjs/') ||
            id.includes('/react-redux/') ||
            id.includes('/redux-persist/')
          ) return 'redux'

          // Monaco editor — very large, only needed on coding-round pages
          if (id.includes('@monaco-editor')) return 'monaco'

          // Recharts — only needed on dashboard pages
          if (id.includes('/recharts/') || id.includes('/victory-')) return 'recharts'

          // PDF / export libs — only needed for report downloads
          if (
            id.includes('/jspdf/') ||
            id.includes('/html2pdf') ||
            id.includes('/html-to-image/')
          ) return 'pdf'

          // Radix UI primitives — shared UI, stable
          if (id.includes('@radix-ui/')) return 'radix'

          // Framer Motion — animation lib, medium-sized
          if (id.includes('/framer-motion/')) return 'framer'

          // SweetAlert2 + Sonner — notification libs
          if (id.includes('/sweetalert2/') || id.includes('/sonner/')) return 'alerts'

          // Lucide icons — many small files, bundle together
          if (id.includes('/lucide-react/')) return 'icons'

          // Everything else from node_modules
          return 'vendor'
        },
      },
    },
  },
})
