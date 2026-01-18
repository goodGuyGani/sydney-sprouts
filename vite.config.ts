import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

const tauriPlatform = process.env.TAURI_PLATFORM
const isTauri = typeof tauriPlatform === 'string' && tauriPlatform.length > 0
const isTauriDebug = process.env.TAURI_DEBUG === 'true'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  clearScreen: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5174,
    },
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: isTauri ? 'chrome105' : 'es2022',
    minify: isTauriDebug ? false : 'esbuild',
    sourcemap: isTauriDebug,
  },
})
