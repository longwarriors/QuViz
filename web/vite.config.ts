import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset URLs: the same bundle is served at "/" by FastAPI
  // (`quviz serve`, the fullstack gate), by `vite preview` (the visual gate)
  // and under /<repo>/ by GitHub Pages. The app has no client-side router, so
  // no URL ever needs an absolute base.
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/docs': 'http://127.0.0.1:8000',
      '/openapi.json': 'http://127.0.0.1:8000',
      '/redoc': 'http://127.0.0.1:8000',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
