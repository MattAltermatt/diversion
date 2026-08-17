/* Guard the deep-link preload map after `npm run build` (#291).
 *
 * Run: `node scripts/check-preload.mjs` (CI does, right after the build).
 *
 * The map is emitted by a build plugin from content-hashed filenames, so every way it
 * can break is silent: the build stays green, the page still works, and only a
 * throttled network trace shows that the ~613 ms it exists to remove came back. The
 * four failures this catches, in the order they are most likely:
 *
 *  1. The script drifts BEHIND a stylesheet or the entry script. An inline script does
 *     not execute while a stylesheet declared before it is loading, so appended at the
 *     end of <head> the links were created only once the CSS had arrived — the exact
 *     moment __vitePreload would have asked for them anyway. Measured on Slow 4G as a
 *     0 ms saving with the map still shipped. This one already happened. The mirror
 *     constraint is checked too: <meta charset> must stay inside the spec's 1024-byte
 *     window, which is why the script sits immediately AFTER it rather than first.
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

// ── 1. present, and ahead of everything that would block it ──────────────────
const mapMatch = /<script>\(function\(\)\{try\{var B="([^"]*)",X=(\[.*?\]),D=X\[0\]/s.exec(html)
if (!mapMatch) {
  fail('no preload map in dist/index.html — the plugin did not run (#291)')
  process.exit(1)
}

const scriptAt = mapMatch.index
const blockers = [
  ['a stylesheet', html.indexOf('<link rel="stylesheet"')],
  ['the entry module script', html.indexOf('<script type="module"')],
]
for (const [what, at] of blockers) {
  if (at >= 0 && at < scriptAt) {
    fail(
      `the preload script comes after ${what}. An inline script does not execute ` +
        'while a stylesheet declared before it is loading, so the links would be ' +
        'created at exactly the moment __vitePreload would have asked anyway — a ' +
        '0 ms saving with the map still shipped.',
    )
  }
}

// ...and the charset meta must still be inside the spec's 1024-byte prescan window,
// which is why the script is placed AFTER it rather than first in <head>. This tag is
// ~8 kB; prepending it pushed charset to byte 8147.
const charsetAt = html.search(/<meta[^>]+charset=/i)
if (charsetAt < 0 || charsetAt > 1024) {
  fail(
    `<meta charset> is at byte ${charsetAt} — it must be serialized within the first ` +
      '1024 bytes. Place the preload script immediately AFTER it.',
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

// ── 2b. the map carries DEPS, not just the chunks ────────────────────────────
// Preloading a diversion chunk without its shared deps saves nothing measurable:
// __vitePreload asks for the deps in the same round trip, so removing one file from
// that batch leaves the batch. A map that degrades to chunk-only still passes every
// other check here — it is the right count, the right files, no duplicates — while
// being worth zero.
if (deps.length === 0) {
  fail('preload map has NO shared deps — chunk-only preloading saves nothing (#291)')
}
const depless = Object.entries(slugs).filter(([, entry]) => entry.length < 2)
if (depless.length > Object.keys(slugs).length / 2) {
  fail(
    `${depless.length} of ${Object.keys(slugs).length} diversions have no deps listed ` +
      '— the dep traversal has probably broken',
  )
}

// ── 3. every referenced file exists ──────────────────────────────────────────
const referenced = new Set(deps)
for (const entry of Object.values(slugs)) referenced.add(entry[0])
const referencedFor = (slug) => slugs[slug].length
for (const file of referenced) {
  if (!existsSync(join(DIST, file))) fail(`preload map references a missing file: ${file}`)
}

// ── 4. nothing index.html already preloads ───────────────────────────────────
const already = new Set(
  [...html.matchAll(/<link rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) =>
    m[1].startsWith(base) ? m[1].slice(base.length) : m[1],
  ),
)
if (already.size === 0) {
  // The duplicate check below is only meaningful if this found something. Vite emits
  // at least the runtime and metas links; zero means the attribute order changed and
  // the regex now matches nothing, which would let duplicates through forever.
  fail('found no <link rel=modulepreload> in index.html to compare against — regex drift')
}
for (const file of referenced) {
  if (already.has(file)) fail(`preload map duplicates a link index.html already has: ${file}`)
}

// ── 4b. the shipped script actually turns a real URL into links ──────────────
// Everything above checks the DATA. This checks the code path: the script's slug regex
// is a copy of the router's path segment, and a route rename would leave the map
// shipping while no link is ever created, with every other gate green.
{
  const script = /<script>(\(function\(\)\{try\{.*?\}\)\(\))<\/script>/s.exec(html)?.[1]
  const slug = Object.keys(slugs)[0]
  const appended = []
  const doc = { createElement: () => ({}), head: { appendChild: (el) => appended.push(el) } }
  // `window` is shadowed too: the script republishes the map on it for #293, and the
  // script's own try/catch would otherwise swallow the ReferenceError and report zero
  // links — which is exactly what this check would then blame on the router.
  const win = {}
  try {
    new Function(
      'location',
      'document',
      'window',
      script,
    )({ pathname: `${base}d/${slug}/play` }, doc, win)
  } catch (err) {
    fail(`the shipped preload script threw: ${err}`)
  }
  if (!win.__diversionAssets) {
    fail('the script did not republish the asset map — "keep the gallery offline" (#293) reads it')
  }
  if (appended.length !== referencedFor(slug)) {
    fail(
      `the shipped script produced ${appended.length} links for /d/${slug}/play, ` +
        `expected ${referencedFor(slug)} — the URL parsing does not match the router`,
    )
  }
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
      `ahead of the stylesheet, index.html ${(gz / 1024).toFixed(1)} kB gz`,
  )
}
