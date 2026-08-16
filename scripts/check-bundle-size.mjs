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
import { readdirSync, readFileSync, statSync } from 'node:fs'
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

if (failed) process.exit(1)
console.log('\n✓ bundle within budget')
