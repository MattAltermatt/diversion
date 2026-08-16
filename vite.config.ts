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
  build: {
    rollupOptions: {
      output: {
        advancedChunks: {
          groups: [
            // Pull the 137 meta.ts files out of the entry chunk. Every diversion's
            // index.ts does `import { meta } from './meta'`, so while the metas live
            // in the entry, all 137 lazy chunks statically import the ENTRY — whose
            // hash moves on every single deploy (it carries the metas and the
            // dynamic-import map). The result was that changing one line in one
            // diversion rehashed 138 of 147 emitted files. Giving the metas their own
            // chunk breaks that edge: a diversion chunk now imports `metas`, which
            // only changes when a meta.ts does.
            { name: 'metas', test: /src\/diversions\/[^/]+\/meta\.ts$/ },
          ],
        },
      },
    },
  },
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
