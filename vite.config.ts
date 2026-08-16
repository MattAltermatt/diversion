/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
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
        // Diversion chunks get their own DIRECTORY, not just their own name (#289).
        // This is what lets ONE glob precache the shell (`assets/*.js` does not cross
        // a slash) and ONE runtime-cache route claim the 137 lazy chunks, with no
        // negative lookahead anywhere — the two cache tiers become impossible to
        // confuse rather than held apart by a fragile regex. A dynamic-import entry
        // chunk carries `facadeModuleId`; the shared chunks do not, so they stay in
        // assets/ and land in the precache with the shell, which is what we want.
        chunkFileNames: (chunk) =>
          chunk.facadeModuleId?.includes('/src/diversions/')
            ? 'assets/d/[name]-[hash].js'
            : 'assets/[name]-[hash].js',
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
  plugins: [
    react(),
    // Service worker (#289). Two cache tiers, deliberately:
    //
    //   PRECACHE (~167 kB, 15 files) — the shell and the 7 shared chunks. Downloaded
    //   on install, atomically, so the app always boots offline.
    //   RUNTIME  — the 137 diversion chunks, the neural-ca weights, and the sprites.
    //   Fetched when actually asked for, then kept.
    //
    // Not a full precache. Precaching all 140 chunks would re-centralise exactly what
    // #288 spent a cycle decentralising, and cost every first-time viewer 1.7 MB — of
    // which 858 kB is one diversion's neural-net weights and ~570 kB is 134 pieces the
    // median viewer never opens. The gallery's own IntersectionObserver warms the
    // runtime cache as you scroll, so the two converge; only the timing differs.
    //
    // The consequence, stated plainly: offline, a piece you have never opened will not
    // run. Browsing the whole gallery offline wants an explicit opt-in affordance,
    // not 1.5 MB spent silently on everyone.
    VitePWA({
      strategies: 'generateSW',
      // autoUpdate, NOT the 'prompt' default. 'prompt' only ever calls onNeedRefresh,
      // and with no update UI wired that means the app NEVER updates: a tab left open
      // — i.e. the shelf-mounted display this whole feature is for — stays pinned to
      // the first build it ever saw, accumulating one precache generation per deploy.
      //
      // autoUpdate is safe here BECAUSE the precache is shell-only. It activates
      // immediately and deletes the outdated precache, which under a full precache
      // would strand an in-flight lazy import() on a chunk that is now 404 on Pages
      // (and #292 makes that terminal for the diversion). Diversion chunks live in a
      // RUNTIME cache, which cleanupOutdatedCaches does not touch, so they survive.
      registerType: 'autoUpdate',
      // public/manifest.webmanifest is hand-authored and guarded by manifest.test.ts
      // (its missing `id` is load-bearing on this shared origin). Letting the plugin
      // generate one overwrites that file in dist/ with Vue-green theme_color, a white
      // splash background, and an ABSOLUTE scope — while the test, which reads
      // public/, stays green. dist/index.html would also carry two manifest links.
      manifest: false,
      workbox: {
        // Explicit: Workbox's default is ["**/*.{js,wasm,css,html}"], which would both
        // miss things and sweep in assets/d/. `assets/*.js` does not cross a slash, so
        // it takes the entry + shared chunks and leaves the 137 lazy ones alone.
        // Deliberately absent: assets/d/**, models-*.json (858 kB for one piece), and
        // the 512px launcher icons (114 kB the OS fetches itself, at install time,
        // which is inherently online).
        globPatterns: ['index.html', 'assets/*.{js,css}', 'manifest.webmanifest', '*.svg', 'icon-192.png'],
        // deploy.yml copies index.html to 404.html AFTER the build; it still serves
        // every uncontrolled client and every browser without SW support, so it stays
        // — it just must not be a second precache entry for the same bytes.
        globIgnores: ['**/404.html'],
        // Resolves against the SW's own URL (/diversion/sw.js), so bare 'index.html'
        // is CORRECT. #289 asks to verify it becomes '/diversion/index.html' — it does
        // not, and making it absolute would break `vite preview` and dev.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Content-hashed => immutable => CacheFirst is unconditionally correct:
            // changed content means a changed URL means a miss, never a stale hit.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\/assets\/d\/[^/]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'diversion-chunks-v1',
              // maxEntries is the real bound (137 live x ~1.6 for one stale
              // generation; LRU evicts the stale ones first, by definition).
              // maxAgeSeconds is GARBAGE COLLECTION, not correctness, and is set long
              // on purpose: ExpirationPlugin expires on access, so a short age would
              // break the exact case this exists for — a shelf device offline for
              // weeks finding its chunks expired and falling through to a dead network.
              expiration: { maxEntries: 220, maxAgeSeconds: 60 * 60 * 24 * 180, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // neural-ca's learned weights: hashed like the chunks, but 858 kB gzipped
            // on its own. Separate cache so it can never evict 200 diversion chunks.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\/assets\/models-[^/]+\.json$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'diversion-weights-v1',
              expiration: { maxEntries: 3, maxAgeSeconds: 60 * 60 * 24 * 180, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // public/pictures/* is copied VERBATIM — no content hash — so CacheFirst
            // would pin a stale sprite or a stale credits.json until expiry. Match the
            // strategy to the URL's MUTABILITY, not to the file type.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\/pictures\/[^/]+$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'diversion-pictures-v1',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 180, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // No SW in dev at all — keeps the port-5180 workflow free of a stale-cache
      // debugging trap, and means dev never registers anything under base '/'.
      devOptions: { enabled: false },
    }),
  ],
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
