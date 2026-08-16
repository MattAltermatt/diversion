/* Guard the entry chunk's size after `npm run build` (#288).
 *
 * Run: `node scripts/check-bundle-size.mjs` (CI does, right after the build).
 *
 * Why this exists: the entry chunk grew to 1.91 MB — 615 kB gzipped, a 5.2 s
 * cold-cache LCP on Slow 4G — one diversion at a time, and nothing said a word. It
 * was found by going looking, a year late. The failure mode is inherently gradual,
 * which is exactly the kind a test catches and a human does not.
 *
 * The ceiling is on the ENTRY chunk, not the total. Total JS necessarily grew when
 * we split (145 small streams gzip worse than one big one); what must stay small is
 * the bytes between a first-time visitor and a rendered gallery.
 *
 * A second ceiling guards the largest single file against Workbox's
 * `maximumFileSizeToCacheInBytes` default of 2,097,152 (#289). Exceeding that does
 * not fail a build — `workbox-build` warns and SILENTLY OMITS the file from the
 * precache manifest, so the app stops being offline-capable with everything green.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

/** Newest mtime under a directory tree. */
function newestMtime(dir) {
  let newest = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    newest = Math.max(newest, e.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs)
  }
  return newest
}

// Headroom over the measured values at the time of writing (123.28 kB gz entry,
// 382.21 kB raw), leaving room for ordinary growth while still catching a
// regression that re-eagerises the registry — which would blow this by ~5x.
const MAX_ENTRY_GZIP = 200 * 1024
// Shell-only precache budget (#289): measured at 16 files / 166.4 kB gz, with
// headroom for a shared chunk or two. Well under half of what a leaked diversion
// tier would produce (~180 files / ~1.7 MB), so this cannot be tripped by drift.
const MAX_PRECACHE_FILES = 24
const MAX_PRECACHE_GZIP = 260 * 1024
const WORKBOX_PRECACHE_CEILING = 2 * 1024 * 1024
const MAX_SINGLE_FILE = WORKBOX_PRECACHE_CEILING * 0.75

const assets = join('dist', 'assets')
const files = readdirSync(assets)

const entries = files.filter((f) => /^index-.*\.js$/.test(f))
if (entries.length !== 1) {
  console.error(`✗ expected exactly one entry chunk in dist/assets, found ${entries.length}`)
  process.exit(1)
}

const entryPath = join(assets, entries[0])
const entryGzip = gzipSync(readFileSync(entryPath)).length
const entryRaw = statSync(entryPath).size

// Refuse to report on a stale dist/. CI always builds first, but run locally after
// an edit this would happily print reassuring numbers for the PREVIOUS build — the
// exact false-confidence this script exists to prevent.
if (newestMtime('src') > statSync(entryPath).mtimeMs) {
  console.error('✗ dist/ is older than src/ — run `npm run build` first.')
  process.exit(1)
}

// Walk dist/ entirely, not just dist/assets: the Workbox ceiling applies per FILE,
// and anything copied from public/ lands in the dist root where an assets-only scan
// would never see it.
let biggest = { name: '', size: 0 }
const walkDist = (dir, rel = '') => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    const label = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) walkDist(p, label)
    else {
      const size = statSync(p).size
      if (size > biggest.size) biggest = { name: label, size }
    }
  }
}
walkDist('dist')

const kb = (n) => `${(n / 1024).toFixed(1)} kB`
let failed = false

// The `metas` chunk is the entire mechanism keeping 133 of 137 diversion chunks
// unpinned from the entry hash. If its advancedChunks group stops matching, the metas
// fold back into the entry, every deploy rehashes ~138 files again, and NOTHING else
// notices — the entry would sit around 119 kB gz, comfortably under its ceiling.
const hasMetasChunk = readdirSync(assets).some((f) => /^metas-.*\.js$/.test(f))

if (!hasMetasChunk) {
  console.error(
    '\n✗ no assets/metas-*.js chunk. The advancedChunks group in vite.config.ts has\n' +
      '  stopped matching src/diversions/*/meta.ts, so the metas are back in the entry\n' +
      '  chunk and every deploy will rehash ~138 files instead of ~6.',
  )
  failed = true
}

console.log(`entry chunk        ${entries[0]}`)
console.log(`  raw              ${kb(entryRaw)}`)
console.log(`  gzip             ${kb(entryGzip)}  (ceiling ${kb(MAX_ENTRY_GZIP)})`)
console.log(`largest asset      ${biggest.name}`)
console.log(`  raw              ${kb(biggest.size)}  (ceiling ${kb(MAX_SINGLE_FILE)})`)

if (entryGzip > MAX_ENTRY_GZIP) {
  console.error(
    `\n✗ entry chunk is ${kb(entryGzip)} gzipped, over the ${kb(MAX_ENTRY_GZIP)} ceiling.\n` +
      `  Something is probably being imported EAGERLY that should be lazy — check that\n` +
      `  framework/registry.ts still lazy-globs index.ts, and that no production module\n` +
      `  imports framework/testRegistry.ts.`,
  )
  failed = true
}

if (biggest.size > MAX_SINGLE_FILE) {
  console.error(
    `\n✗ ${biggest.name} is ${kb(biggest.size)}, over the ${kb(MAX_SINGLE_FILE)} ceiling\n` +
      `  (75% of Workbox's ${kb(WORKBOX_PRECACHE_CEILING)} precache limit). Past that limit\n` +
      `  workbox-build omits the file from the precache manifest with only a warning.`,
  )
  failed = true
}

// ── Precache tier guard (#289) ───────────────────────────────────────────────
// The service worker precaches the SHELL ONLY; the 137 diversion chunks are
// runtime-cached from assets/d/. That split is enforced by ONE thing — the
// `chunkFileNames` callback in vite.config.ts — and if it ever stops routing
// diversion chunks into assets/d/, they land in assets/ where the `assets/*.js`
// glob sweeps all 137 straight into the precache. Every first visit would then
// download ~1.7 MB instead of ~167 kB, with a green build and no failing test.
// Silent and gradual, exactly like the entry-chunk growth above.
const swPath = join('dist', 'sw.js')
if (existsSync(swPath)) {
  const sw = readFileSync(swPath, 'utf8')
  const precached = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1])
  const precacheGzip = precached.reduce(
    (n, u) => n + gzipSync(readFileSync(join('dist', u))).length,
    0,
  )
  const lazyDir = join('dist', 'assets', 'd')
  const lazy = existsSync(lazyDir) ? readdirSync(lazyDir).filter((f) => f.endsWith('.js')) : []

  console.log(`precache           ${precached.length} files, ${kb(precacheGzip)} gz`)
  console.log(`lazy chunks        ${lazy.length} in assets/d/`)

  const leaked = precached.filter((u) => u.startsWith('assets/d/'))
  if (leaked.length) {
    console.error(
      `\n✗ ${leaked.length} diversion chunk(s) reached the PRECACHE manifest, e.g. ${leaked[0]}.\n` +
        '  assets/d/ is the runtime-cached tier — check build.rollupOptions.output.chunkFileNames.',
    )
    failed = true
  }
  if (precached.length > MAX_PRECACHE_FILES || precacheGzip > MAX_PRECACHE_GZIP) {
    console.error(
      `\n✗ precache is ${precached.length} files / ${kb(precacheGzip)} gz, over the ` +
        `${MAX_PRECACHE_FILES} file / ${kb(MAX_PRECACHE_GZIP)} shell budget.`,
    )
    failed = true
  }
  // Non-vacuity on the PRECACHE side. `precached` comes from regexing MINIFIED
  // workbox output, so a workbox major that renames the property yields an empty
  // list — and then the leak check finds nothing and both ceilings pass at 0 bytes.
  // A floor turns that silent pass into a loud failure.
  if (precached.length < 10) {
    console.error(
      `\n✗ only ${precached.length} precache entries parsed from sw.js — expected ~16.\n` +
        "  The manifest's minified shape has probably changed; this script's regex needs\n" +
        '  updating, and until it is, the precache ceilings above are meaningless.',
    )
    failed = true
  }
  // Non-vacuity: the two checks above both pass trivially if the lazy tier is empty
  // (e.g. the registry went eager again, or chunkFileNames stopped matching).
  if (lazy.length < 100) {
    console.error(
      `\n✗ only ${lazy.length} chunks in assets/d/ — expected ~137. The registry may be\n` +
        '  eager again, or chunkFileNames stopped routing diversion chunks.',
    )
    failed = true
  }
}

if (failed) process.exit(1)
console.log('\n✓ bundle within budget')
