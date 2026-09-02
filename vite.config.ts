/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
// Explicit .ts extension: tsconfig.node.json resolves with `module: nodenext`
// (allowImportingTsExtensions is on), unlike the app project's bundler mode.
import { resolveBase } from './src/framework/basePath.ts'
import { buildPreloadMap, preloadScript, type PreloadChunk } from './src/framework/preloadMap.ts'
import { DIVERSION_SEGMENT } from './src/framework/routes.ts'

/** Collapse the deep-link waterfall (#291).
 *
 * A cold `/d/<slug>/play` used to be HTML -> entry -> diversion chunk, three serial
 * round trips. This emits a slug -> [chunk, ...shared deps] map into index.html and a
 * ~350 byte script that turns the URL's slug into `<link rel=modulepreload>` tags, so
 * the diversion's bytes download IN PARALLEL with the entry rather than after it.
 * Measured saving: ~613 ms median on Slow 4G, ~961 ms worst (boxcar2d).
 *
 * The map has to be built here because chunk filenames are content-hashed and only
 * known at `generateBundle` time — which is exactly when `transformIndexHtml` runs in
 * a build, with the finished bundle on `ctx`. All of the reasoning, and the pure
 * function this is a shell around, live in src/framework/preloadMap.ts (unit-tested;
 * this wrapper is deliberately too thin to hold a bug of its own).
 *
 * ⚠️ WHERE the tag goes is the whole plugin. An inline `<script>` does not execute
 * while a stylesheet declared BEFORE it is still loading — so appended at the end of
 * head, after Vite's `<link rel=stylesheet>`, the links were created only once the CSS
 * had arrived. Measured on Slow 4G at the tail of the entry's own download, which is
 * precisely the moment `__vitePreload` would have asked for them anyway: a 0 ms
 * saving, with the map still shipped.
 *
 * But NOT first in head either: this tag is ~8 kB, and `<meta charset>` must be
 * serialized within the first 1024 bytes to conform (Chrome's prescan reads no
 * further). Pages sends a charset header that outranks the meta, so prepending was not
 * a live bug — it was a non-conforming document that breaks under `file://` or any
 * host that omits the header. So it goes IMMEDIATELY AFTER the charset meta: before
 * every stylesheet and every script, and inside the 1024-byte window. Both halves are
 * asserted by `npm run check:preload`.
 *
 * `enforce: 'post'` is only about seeing the finished bundle; it does not affect
 * where the tag lands. Guarded after the build by `npm run check:preload`. */
function preloadDeepLink(base: string) {
  return {
    name: 'diversion-preload-deep-link',
    enforce: 'post' as const,
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string, ctx: { bundle?: Record<string, PreloadChunk> }) {
        if (!ctx.bundle) return // dev / serve: no bundle, and no waterfall to collapse
        const map = buildPreloadMap(ctx.bundle)
        if (!Object.keys(map.slugs).length) return
        const tag = `<script>${preloadScript(map, base, DIVERSION_SEGMENT)}</script>`
        const charset = /<meta[^>]+charset=[^>]*>/i.exec(html)
        // No charset meta to anchor to: fall back to first-in-head, which is the
        // performance-correct placement and is what the guard would then measure.
        if (!charset) {
          return [{ tag: 'script', children: preloadScript(map, base, DIVERSION_SEGMENT), injectTo: 'head-prepend' as const }]
        }
        const at = charset.index + charset[0].length
        return `${html.slice(0, at)}\n    ${tag}${html.slice(at)}`
      },
    },
  }
}

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
    preloadDeepLink(resolveBase({ command, isPreview })),
    // Service worker (#289). Two cache tiers, deliberately:
    //
    //   PRECACHE (~166 kB, 17 files) — the shell and the 9 shared chunks. Downloaded
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
      // autoUpdate, NOT the 'prompt' default — but be precise about what that buys
      // here, because the obvious reading is wrong in both directions.
      //
      // What it DOES do: the new SW skips waiting, activates, and runs
      // cleanupOutdatedCaches. Measured across three simulated deploys, the precache
      // stays at exactly 16 entries and storage goes DOWN on cleanup. Under 'prompt'
      // + skipWaiting:false the new SW would sit in `waiting` forever while a tab is
      // open, so nothing is ever pruned and each deploy adds a whole generation.
      //
      // What it does NOT do: reload the page. Nothing imports `virtual:pwa-register`,
      // so injectRegister falls back to the simple script — a bare register() call
      // with no workbox-window and no `activated` listener. An open tab therefore
      // keeps running the OLD bundle until something reloads it naturally. That is a
      // deliberate keep: auto-reloading would restart a propped-up display mid-piece
      // on every deploy, and this repo deploys often. Wiring the reload is a one-line
      // change (import registerSW and call it) if that trade ever flips.
      //
      // Stranding: shell-only precache means diversion chunks live in a RUNTIME cache
      // that cleanupOutdatedCaches cannot touch (it filters on '-precache-'), so they
      // survive an activation. Their PRECACHED shared-chunk dependencies do not — a
      // stale document can therefore still fail a lazy import whose dep was evicted
      // and is 404 on Pages. Narrow (a document holding a chunk has usually resolved
      // its deps already) but real, and #292 makes it terminal for that id until a
      // reload. The SW neither causes nor cures that; it behaves the same without one.
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
        // registerSW.js is in the list because index.html loads it: without it, every
        // offline load logs a failed resource fetch. Harmless (the SW is already
        // registered by then) but it is the ONLY error on an otherwise clean offline
        // load, so it is the first red herring anyone debugging offline would chase.
        globPatterns: [
          'index.html',
          'registerSW.js',
          'assets/*.{js,css}',
          'manifest.webmanifest',
          '*.svg',
          'icon-192.png',
        ],
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
              cacheableResponse: { statuses: [200] }, // 0 = opaque cross-origin; unreachable behind sameOrigin
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
              cacheableResponse: { statuses: [200] }, // 0 = opaque cross-origin; unreachable behind sameOrigin
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
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 180, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] }, // 0 = opaque cross-origin; unreachable behind sameOrigin
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
