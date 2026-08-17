/* Every emitted file has exactly one home, and the offline warm reaches all of them (#296).
 *
 * Run: `node scripts/check-cache-lanes.mjs` (CI does, right after the build).
 *
 * Three lanes claim the files the build emits, and until now nothing checked that the
 * partition was total:
 *
 *   PRECACHE   the shell — `globPatterns` in vite.config.ts, 18 files
 *   RUNTIME    the 137 diversion chunks, neural-ca's weights, the sprites — one
 *              `runtimeCaching` route each
 *   UNCACHED   a short, declared list of things deliberately left out
 *
 * Today the partition happens to be exactly right, and it is right by coincidence:
 * `models-*.json` is the only non-JS/CSS asset emitted under `assets/`, and
 * `neural-ca/models.ts` is the only `?url` import in the repo. A second one — a
 * `.wasm`, a `.woff2`, a bundled `.png` — would be neither precached nor
 * runtime-cached nor warmed. That piece would silently not work offline, with
 * `npm test`, `npm run size`, `npm run check:pwa` and `npm run check:preload` all
 * green, and it would be found by someone on a plane.
 *
 * ## Two lanes, not three — the issue's own framing was slightly wrong
 *
 * #296 proposes partitioning across {precache, runtime route, `PreloadMap.extras`}.
 * That conflates two different questions. `extras` is not a caching lane; it is part of
 * the WARM list — which URLs #293 fetches so the service worker's existing routes get
 * a chance to store them. `assets/models-*.json` is legitimately in both, and under a
 * three-way partition it would read as "doubly covered" forever.
 *
 * So this checks the partition over the two lanes that actually STORE, and then checks
 * warm coverage as its own question, in both directions:
 *
 *   every runtime-cached file is in the warm list  — or "the whole gallery works
 *     offline" is false for it, since nothing else will ever cache it
 *   every warm URL is a runtime-cached file        — or the warm downloads bytes that
 *     are immediately discarded, or 404s outright
 *
 * The precached files are deliberately NOT in the warm list (they are already there
 * after install; warming them re-downloads ~170 kB for nothing), which is why the first
 * direction is stated over the runtime set rather than over everything.
 *
 * ## What would make this check wrong rather than merely red
 *
 * The partition assumes the routes are DISJOINT and that none of them is a fallback.
 * Add workbox's common catch-all same-origin route and every emitted file is instantly
 * claimed twice — a wall of `doubly` noise whose likeliest response is to weaken the
 * check. If that day comes, the fix is to rank the routes the way workbox does (first
 * registered wins) and partition on the WINNER, not to drop the assertion.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import {
  classifyAssets,
  extractPrecache,
  extractRuntimeLanes,
  warmTargets,
} from './cacheLanes.mjs'

const DIST = 'dist'

let failed = false
const fail = (msg) => {
  console.error(`\n✗ ${msg}`)
  failed = true
}

/* Files that reach a viewer's device but that no cache should hold, each with the
 * reason. This list is the point of the check as much as the lanes are: an emitted file
 * that is in none of them fails the build until somebody writes a line here, so the
 * omissions stay decisions instead of becoming oversights. */
const UNCACHED = [
  {
    pattern: /^sw\.js$/,
    why: 'the service worker itself — the browser fetches and revalidates it by its own rules',
  },
  {
    pattern: /^workbox-[^/]+\.js$/,
    why: "the SW's own runtime, importScripts'd by sw.js and held with it",
  },
  {
    pattern: /^(icon-512|icon-maskable-512|apple-touch-icon)\.png$/,
    why: 'launcher icons (~117 kB) the OS fetches at install time, which is inherently online',
  },
  {
    pattern: /^404\.html$/,
    why: 'globIgnores: a byte-identical copy of index.html, and deploy.yml makes it after this check',
    // The one rule that legitimately matches nothing: the file does not exist yet when
    // this runs (CI never makes it at all). Every OTHER rule going dead — an icon
    // renamed by make-icons.mjs, a workbox filename change — is a stale exemption that
    // should be noticed, so absence is an error unless declared here.
    mayBeAbsent: true,
  },
]

if (!existsSync(join(DIST, 'sw.js'))) {
  console.error('✗ dist/sw.js is missing — run `npm run build` first.')
  process.exit(1)
}
const sw = readFileSync(join(DIST, 'sw.js'), 'utf8')
const html = readFileSync(join(DIST, 'index.html'), 'utf8')

// Refuse to report on a stale dist/, as check-bundle-size.mjs does — but over a WIDER
// set of inputs than that one watches. This check's subject matter is `runtimeCaching`
// and `globPatterns` in vite.config.ts, and the sprites in public/; edit either, re-run
// without rebuilding, and an src-only guard reports a clean partition for the previous
// build. CI always builds fresh, so this is purely a local-workflow trap — which is
// exactly the workflow that would be misled.
const newestMtime = (dir) => {
  let newest = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    newest = Math.max(newest, e.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs)
  }
  return newest
}
const newestInput = Math.max(
  newestMtime('src'),
  newestMtime('public'),
  statSync('vite.config.ts').mtimeMs,
)
if (newestInput > statSync(join(DIST, 'index.html')).mtimeMs) {
  console.error('✗ dist/ is older than src/, public/ or vite.config.ts — run `npm run build` first.')
  process.exit(1)
}

// ── the emitted files, and the base they will be served under ────────────────
const files = []
const walk = (dir, rel = '') => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const label = rel ? posix.join(rel, e.name) : e.name
    if (e.isDirectory()) walk(join(dir, e.name), label)
    else files.push(label)
  }
}
walk(DIST)

// The base the app actually ships under, read from the preload script rather than
// recomputed — a lane pattern that only matches at the root would pass against a bare
// '/' here and then claim nothing on Pages.
const published = /<script>\(function\(\)\{try\{var B="([^"]*)",X=(\[.*?\]),D=X\[0\]/s.exec(html)
if (!published) {
  console.error('✗ no preload map in dist/index.html — cannot determine the deployed base.')
  process.exit(1)
}
const base = published[1]
let deps, slugs, extras
try {
  ;[deps, slugs, extras] = JSON.parse(published[2])
} catch {
  console.error('✗ the published asset map is not valid JSON.')
  process.exit(1)
}

// ── the lanes ────────────────────────────────────────────────────────────────
const precache = extractPrecache(sw)
const lanes = extractRuntimeLanes(sw)

// Non-vacuity, before anything is concluded from them. Both lane sources are regexes
// over MINIFIED workbox output, so a workbox major that renames a property or emits
// `new RegExp(...)` instead of a literal yields empty lists — and then every file below
// reads as uncovered (loud, fine) or, if the file list also broke, the whole check
// passes over nothing. Assert the shapes are still recognisable.
if (precache.length < 10) {
  fail(
    `only ${precache.length} precache entries parsed from sw.js — expected ~18. The\n` +
      "  manifest's minified shape has changed and this check cannot see the shell lane.",
  )
}
if (lanes.length < 3) {
  fail(
    `only ${lanes.length} runtime-caching route(s) parsed from sw.js — expected 3\n` +
      '  (chunks, weights, pictures). The route shape has changed, or a route was dropped.',
  )
}
for (const lane of lanes) {
  if (!lane.matches) {
    fail(
      `runtime route ${lane.cacheName} has an unreadable urlPattern — the route's first\n` +
        '  argument did not evaluate to a function, a RegExp or a string.',
    )
  }
}

const { owner, shadowedBy, contradicted, uncovered, ownedBy, runtime } = classifyAssets({
  files,
  base,
  precache,
  lanes,
  exempt: UNCACHED,
})

// A lane that OWNS nothing is the silent failure this check is most likely to have
// itself: a mangled pattern excludes every file, the partition still looks total
// because the precache covers the shell, and the 137 chunks show up as uncovered —
// unless a future edit ever makes them exempt. Under first-match ownership this also
// catches a route fully shadowed by an earlier one, which is dead config.
for (const lane of lanes) {
  if (!lane.matches) continue
  if (ownedBy(`runtime:${lane.cacheName}`).length === 0) {
    fail(
      `runtime route ${lane.cacheName} owns ZERO emitted files — its pattern and the build\n` +
        '  output have diverged, or an earlier route shadows it entirely. Either way those\n' +
        '  files are not being stored where this route says they are.',
    )
  }
}

// ── maxEntries is a CORRECTNESS bound, not a budget ──────────────────────────
// workbox's ExpirationPlugin deletes past maxEntries AS ENTRIES ARE WRITTEN
// (CacheTimestampsModel.expireEntries), so a lane holding more files than its cap
// silently loses the overflow — during a warm, the earliest-written ones. Nothing else
// in the repo compares a lane's population to its cap.
//
// This is not hypothetical: the pictures lane is 28 entries against maxEntries 40, and
// #287 ("grow the bundled sprite roster") is open. Adding 13 sprites would make the
// offline control report a green tick over a copy that is missing some of them.
const HEADROOM = 1.25
for (const lane of lanes) {
  if (!lane.matches || lane.maxEntries === null) continue
  const n = ownedBy(`runtime:${lane.cacheName}`).length
  if (n > lane.maxEntries) {
    fail(
      `${lane.cacheName} owns ${n} files but its cache holds maxEntries: ${lane.maxEntries}.\n` +
        `  ${n - lane.maxEntries} of them are evicted as they are written — offline they are\n` +
        '  simply absent, and the offline control still reports success.',
    )
  } else if (n * HEADROOM > lane.maxEntries) {
    fail(
      `${lane.cacheName} owns ${n} files against maxEntries: ${lane.maxEntries} — under the\n` +
        `  ${Math.round((HEADROOM - 1) * 100)}% headroom this check requires. Raise maxEntries in\n` +
        '  vite.config.ts before adding more; past the cap the overflow is silently evicted.',
    )
  }
}

// ...and the same rule for the exemptions, which the first version of this check
// applied only to lanes. A rule that matches nothing is an exemption for a file that no
// longer exists under that name — the new name is caught as `uncovered`, so this is not
// the only signal, but a stale rule left standing is what makes the NEXT one look
// plausible. `404.html` is the one declared exception.
for (const rule of UNCACHED) {
  if (rule.mayBeAbsent) continue
  if (!files.some((f) => rule.pattern.test(f))) {
    fail(
      `the UNCACHED rule ${rule.pattern} matches no emitted file. Either the files it\n` +
        '  exempted were renamed (look for them in the uncovered list) or the rule is stale.',
    )
  }
}

const row = (label, n, extra = '') => console.log(`  ${label.padEnd(23)}${String(n).padStart(3)}${extra}`)
console.log(`base               ${base}`)
console.log(`emitted            ${files.length} files, by owning lane (first match wins)`)
row('precache', ownedBy('precache').length)
for (const lane of lanes) {
  row(
    lane.cacheName,
    ownedBy(`runtime:${lane.cacheName}`).length,
    lane.maxEntries === null ? '' : ` / ${lane.maxEntries} max`,
  )
}
row('uncached', files.filter((f) => (owner.get(f) ?? '').startsWith('uncached:')).length)

if (uncovered.length) {
  fail(
    `${uncovered.length} emitted file(s) are stored by NO caching lane:\n` +
      uncovered.map((f) => `    ${f}`).join('\n') +
      '\n  Each is downloaded on demand and never kept, so the piece that needs it does\n' +
      '  not work offline. Precache it (globPatterns), give it a runtimeCaching route, or\n' +
      '  add it to UNCACHED in this file with the reason it should not be held.',
  )
}

if (contradicted.length) {
  fail(
    `${contradicted.length} file(s) are declared UNCACHED but reach a cache anyway:\n` +
      contradicted.map((f) => `    ${f}`).join('\n') +
      '\n  The exemption states a reason the file should not be held, and something holds it.\n' +
      '  Either the reason is stale or the glob/route is wider than intended.',
  )
}

// Informational, deliberately NOT a failure: workbox stores the file once, in the first
// matching lane. A narrow route registered ahead of a broad one is the ordinary way to
// give one big asset its own cache, and calling that an error made a legitimate config
// fail for a reason that does not happen.
if (shadowedBy.size) {
  console.log(`shadowed           ${shadowedBy.size} file(s) match a later lane too (stored once, by the first):`)
  for (const [file, hits] of [...shadowedBy].slice(0, 5)) {
    console.log(`  ${file} — ${hits[0]}, then ${hits.slice(1).join(', ')}`)
  }
}

// ── warm coverage, in both directions (#293) ─────────────────────────────────
// `null` means "no manifest the app could have parsed" — which is what decides whether
// credits.json is itself a warm target, not whether any sprite was found in it. See the
// note on warmTargets: collectTargets pushes it from inside `if (res.ok)`, after the
// JSON parsed, so an EMPTY manifest still warms it.
let credits = null
const creditsPath = join(DIST, 'pictures', 'credits.json')
if (existsSync(creditsPath)) {
  try {
    credits = JSON.parse(readFileSync(creditsPath, 'utf8'))
  } catch {
    fail('dist/pictures/credits.json is not valid JSON — the warm would skip every sprite.')
  }
}
const warm = warmTargets({ slugs, extras, credits })
const warmSet = new Set(warm)

// The warm list is re-derived here from the published map (see cacheLanes.mjs), so a
// derivation that quietly collapsed would make both directions below pass over almost
// nothing. The chunk count is the load-bearing part: #293 refuses to print its green
// tick when it is zero, and this is the build-time half of that same rule.
if (Object.keys(slugs).length < 100) {
  fail(
    `the published map lists ${Object.keys(slugs).length} diversions — expected ~137.\n` +
      '  Warm coverage below is measured against it and would be meaningless.',
  )
}

const unwarmed = runtime.filter((f) => !warmSet.has(f))
if (unwarmed.length) {
  fail(
    `${unwarmed.length} runtime-cached file(s) are never warmed by "keep the gallery offline":\n` +
      unwarmed.slice(0, 10).map((f) => `    ${f}`).join('\n') +
      (unwarmed.length > 10 ? `\n    ...and ${unwarmed.length - 10} more` : '') +
      '\n  Nothing else will ever put them in a cache, so a viewer who pressed the offline\n' +
      '  button still gets a failure for whatever needs them. Add them to the published\n' +
      '  asset map (PreloadMap.extras) or to collectTargets in framework/offlineWarm.ts.',
  )
}

const stray = warm.filter((f) => !files.includes(f))
if (stray.length) {
  fail(
    `the warm list references ${stray.length} file(s) that were not emitted:\n` +
      stray.slice(0, 10).map((f) => `    ${f}`).join('\n') +
      '\n  Those fetches 404 and count as failures, so the control reports a partial result.',
  )
}

const runtimeSet = new Set(runtime)
const discarded = warm.filter((f) => files.includes(f) && !runtimeSet.has(f))
if (discarded.length) {
  fail(
    `the warm list downloads ${discarded.length} file(s) that no runtime route stores:\n` +
      discarded.slice(0, 10).map((f) => `    ${f}`).join('\n') +
      '\n  The bytes are fetched and immediately discarded — either route them, or stop\n' +
      '  warming them.',
  )
}

console.log(`warm targets       ${warm.length} (${runtime.length} runtime-owned files)`)
console.log(`  shared deps      ${deps.length} precached, deliberately not warmed`)

if (failed) {
  console.error('\nCache lane check FAILED.')
  process.exit(1)
}
// State what was actually established, not the ambition. This ran the shipped route
// predicates over every emitted file; it says nothing about a cross-origin fetch, an
// asset inlined under assetsInlineLimit, or anything created after the build.
console.log(
  `\n✓ all ${files.length} emitted files have an owning lane, every lane is inside its\n` +
    `  maxEntries headroom, and the warm covers all ${runtime.length} runtime-owned files`,
)
