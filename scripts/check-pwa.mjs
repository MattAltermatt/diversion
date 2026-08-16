/* Post-build assertions on the emitted service worker and manifest (#289).
 *
 * Run: `node scripts/check-pwa.mjs` (CI and deploy run it right after the build).
 *
 * These live here rather than in a vitest file for one reason: they assert on
 * `dist/`, which does not exist when `npm test` runs. A vitest test would either
 * fail on a clean checkout or — far worse — be written to skip when dist/ is
 * missing, which is the same as not having it.
 *
 * Each check guards a failure that is SILENT: the build stays green, the app looks
 * fine on the machine that built it, and the damage shows up on a viewer's device.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

let failed = false
const fail = (msg) => {
  console.error(`\n✗ ${msg}`)
  failed = true
}

const swPath = join('dist', 'sw.js')
if (!existsSync(swPath)) {
  console.error('✗ dist/sw.js is missing — did the PWA plugin stop emitting a service worker?')
  process.exit(1)
}
const sw = readFileSync(swPath, 'utf8')
const html = readFileSync(join('dist', 'index.html'), 'utf8')

// ── 1. The manifest must be the hand-authored one ────────────────────────────
// `manifest: false` in vite.config.ts. If someone passes a `manifest: {...}`
// object instead, vite-plugin-pwa OVERWRITES dist/manifest.webmanifest with its
// own defaults — Vue-green `theme_color`, a WHITE `background_color` (a white
// splash flash on every standalone launch of a #08080a app), and an ABSOLUTE
// `scope` that manifest.test.ts explicitly forbids — and injects a SECOND
// <link rel="manifest">. manifest.test.ts cannot catch any of it, because it reads
// public/, not dist/.
const publicManifest = readFileSync(join('public', 'manifest.webmanifest'), 'utf8')
const distManifest = readFileSync(join('dist', 'manifest.webmanifest'), 'utf8')
if (publicManifest !== distManifest) {
  fail(
    'dist/manifest.webmanifest differs from public/manifest.webmanifest.\n' +
      '  vite-plugin-pwa has generated one — set `manifest: false`.',
  )
}
const manifestLinks = (html.match(/rel="manifest"/g) ?? []).length
if (manifestLinks !== 1) {
  fail(`dist/index.html has ${manifestLinks} <link rel="manifest">, expected exactly 1.`)
}

// ── 1b. The runtime route must point at the directory the build actually emits ─
// `chunkFileNames` writes diversion chunks to assets/d/, and the runtime route
// matches /assets/d/. NOTHING otherwise ties those two strings together: rename the
// directory, or fat-finger the regex, and the 137 chunks are neither precached NOR
// runtime-cached. Offline silently degrades to "the gallery loads but nothing
// plays", the runtime cache stays empty forever, and both guards pass green —
// verified by mutation, which is why this check exists.
if (!/assets\\\/d\\\//.test(sw)) {
  fail(
    'sw.js has no route matching assets/d/ — the runtime-cache route and\n' +
      "  vite.config.ts's chunkFileNames have diverged. The diversion chunks would be\n" +
      '  neither precached nor runtime-cached, and offline would play nothing.',
  )
}

// ── 2. navigateFallback must stay RELATIVE ───────────────────────────────────
// Precache entries resolve against the service worker's own URL (/diversion/sw.js),
// so bare 'index.html' is correct: it lands on /diversion/index.html in prod and in
// preview alike (resolveBase returns '/diversion/' for isPreview too), and on / in
// dev. #289 asks to verify it resolves to an absolute '/diversion/...';
// it does not, and hardcoding that would break `vite preview` and any future base
// change. This asserts nobody "fixes" it.
if (!/createHandlerBoundToURL\(["']index\.html["']\)/.test(sw)) {
  fail(
    'sw.js navigateFallback is not the relative "index.html".\n' +
      '  An absolute /diversion/ path breaks vite preview and any base change.',
  )
}

// ── 3. Each runtime cache must exist AND use the right strategy ──────────────
// Two failures in one check, both silent. Dropping a route means those fetches
// quietly stop being cached and offline degrades to "shell only". Getting the
// strategy wrong is worse: `pictures/*` is copied from public/ VERBATIM, with no
// content hash, so CacheFirst there pins a stale sprite (or a stale credits.json)
// for the entire expiry window. Match the strategy to the URL's MUTABILITY, not to
// the file type — hashed assets may be CacheFirst, unhashed ones may not.
//
// The strategy is read from the constructor bound to that exact cacheName. Reading
// "the text near the cache name" instead matches the PRECEDING route's constructor
// — which is how the first version of this check reported a false positive.
const strategyFor = (cacheName) => {
  const m = sw.match(
    new RegExp(`new [A-Za-z_$]+\\.(\\w+)\\(\\{cacheName:"${cacheName}"`),
  )
  return m?.[1]
}
for (const [cacheName, expected] of [
  ['diversion-chunks-v1', 'CacheFirst'],
  ['diversion-weights-v1', 'CacheFirst'],
  ['diversion-pictures-v1', 'StaleWhileRevalidate'],
]) {
  const actual = strategyFor(cacheName)
  if (!actual) fail(`sw.js is missing the ${cacheName} runtime cache route.`)
  else if (actual !== expected) {
    fail(
      `${cacheName} uses ${actual}, expected ${expected}.` +
        (cacheName === 'diversion-pictures-v1'
          ? '\n  public/pictures/* is NOT content-hashed — CacheFirst would pin a stale sprite.'
          : ''),
    )
  }
}

if (failed) {
  process.exit(1)
}
console.log('✓ service worker and manifest contracts hold')
