/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Project Pages live at https://mattaltermatt.github.io/diversion/, so the
// production build is served from the /diversion/ subpath. Dev stays at root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/diversion/' : '/',
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
}))
