/* Guard the deep-link preload map after `npm run build` (#291).
 *
 * Run: `node scripts/check-preload.mjs` (CI does, right after the build).
 *
 * The map is emitted by a build plugin from content-hashed filenames, so every way it
 * can break is silent: the build stays green, the page still works, and only a
 * throttled network trace shows that the ~613 ms it exists to remove came back. The
 * four failures this catches, in the order they are most likely:
 *
 *  1. The script stops being FIRST in <head>. An inline script does not execute while
 *     a stylesheet declared before it is loading, so injected after Vite's
 *     <link rel=stylesheet> the links were created only once the CSS had arrived —
 *     the exact moment __vitePreload would have asked for them anyway. Measured on
 *     Slow 4G as a 0 ms saving with the map still shipped. This one already happened.
 *  2. A slug goes missing (a chunkFileNames or facadeModuleId change), so that
 *     diversion's deep link quietly keeps the third round trip.
 *  3. A referenced file is not in dist — a stale map preloading 404s.
 *  4. The map lists something index.html ALREADY preloads, so a deep link fetches it
 *     twice.
 *
 * Plus a size ceiling: the map rides every visit, gallery included, so its whole value
 * depends on staying inside the first congestion window.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

const DIST = 'dist'
const HTML = join(DIST, 'index.html')
/** index.html gzipped, whole file. Measured at 4.2 kB with the map; a first congestion
 *  window is ~14 kB, and staying inside it is what makes the map cost zero round trips. */
const MAX_HTML_GZIP = 8 * 1024

const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exitCode = 1
}

if (!existsSync(HTML)) {
  console.error(`✗ ${HTML} not found — run \`npm run build\` first.`)
  process.exit(1)
}

const html = readFileSync(HTML, 'utf8')

// ── 1. present, and first in <head> ──────────────────────────────────────────
const headOpen = html.indexOf('<head>')
const afterHead = html.slice(headOpen + '<head>'.length)
const firstTag = afterHead.indexOf('<')
const isFirst = /^<script>\(function\(\)\{var B=/.test(afterHead.slice(firstTag))

const mapMatch = /<script>\(function\(\)\{var B="([^"]*)",X=(\[.*?\]),D=X\[0\]/s.exec(html)
if (!mapMatch) {
  fail('no preload map in dist/index.html — the plugin did not run (#291)')
  process.exit(1)
}
if (!isFirst) {
  fail(
    'the preload script is not the FIRST element in <head>. A preceding stylesheet ' +
      'blocks its execution, which silently reduces the saving to zero — use ' +
      "injectTo: 'head-prepend'.",
  )
}

const [, base, rawMap] = mapMatch
let deps, slugs
try {
  ;[deps, slugs] = JSON.parse(rawMap)
} catch {
  fail('the preload map is not valid JSON')
  process.exit(1)
}

// ── 2. one entry per emitted diversion chunk ─────────────────────────────────
const chunkDir = join(DIST, 'assets', 'd')
const emitted = existsSync(chunkDir)
  ? readdirSync(chunkDir).filter((f) => f.endsWith('.js'))
  : []
if (emitted.length === 0) fail('no diversion chunks in dist/assets/d — check chunkFileNames')
if (Object.keys(slugs).length !== emitted.length) {
  fail(
    `preload map covers ${Object.keys(slugs).length} diversions but ${emitted.length} chunks ` +
      'were emitted — some deep links keep the extra round trip',
  )
}

// ── 3. every referenced file exists ──────────────────────────────────────────
const referenced = new Set(deps)
for (const entry of Object.values(slugs)) referenced.add(entry[0])
for (const file of referenced) {
  if (!existsSync(join(DIST, file))) fail(`preload map references a missing file: ${file}`)
}

// ── 4. nothing index.html already preloads ───────────────────────────────────
const already = new Set(
  [...html.matchAll(/<link rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) =>
    m[1].startsWith(base) ? m[1].slice(base.length) : m[1],
  ),
)
for (const file of referenced) {
  if (already.has(file)) fail(`preload map duplicates a link index.html already has: ${file}`)
}

// ── 5. size ──────────────────────────────────────────────────────────────────
const gz = gzipSync(Buffer.from(html)).length
if (gz > MAX_HTML_GZIP) {
  fail(`index.html is ${(gz / 1024).toFixed(1)} kB gzipped, over the ${MAX_HTML_GZIP / 1024} kB ceiling`)
}

if (process.exitCode) {
  console.error('\nPreload map check FAILED.')
} else {
  console.log(
    `✓ preload map: ${Object.keys(slugs).length} diversions, ${deps.length} shared deps, ` +
      `first in <head>, index.html ${(gz / 1024).toFixed(1)} kB gz`,
  )
}
