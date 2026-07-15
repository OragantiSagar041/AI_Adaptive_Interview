import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    // MediaPipe's WASM loader uses a custom Module factory that breaks when
    // Vite pre-bundles it — exclude it so the worker gets the raw ESM files.
    exclude: ['@mediapipe/tasks-vision'],
  },
  worker: {
    format: 'es',
  },
})

