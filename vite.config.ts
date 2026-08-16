/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Explicit .ts extension: tsconfig.node.json resolves with `module: nodenext`
// (allowImportingTsExtensions is on), unlike the app project's bundler mode.
import { resolveBase } from './src/framework/basePath.ts'

// https://vite.dev/config/
// `base` (and why `isPreview` is load-bearing) lives in basePath.ts, where it is
// unit-tested — see src/framework/basePath.test.ts.
export default defineConfig(({ command, isPreview }) => ({
  base: resolveBase({ command, isPreview }),
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
