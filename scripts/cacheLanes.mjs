/* The pure half of `npm run check:cache` (#296) — no filesystem, no dist/.
 *
 * Split out for the same reason `preloadMap.ts` is split out of the preload plugin:
 * the interesting logic here is a small parser over MINIFIED service-worker source,
 * and a parser is exactly the kind of thing that fails silently in the direction of
 * "found nothing, so everything passed". `cacheLanes.test.mjs` runs it against a
 * hand-built service worker, including the one input that breaks the naive version.
 *
 * `.mjs` rather than `.ts` deliberately: CI runs on Node 20, which cannot import
 * TypeScript, and the shell that consumes this is a plain node script.
 */

/** Read a regex LITERAL out of `src` starting at `start` (which must be its opening
 *  slash). Returns `{ body, flags, end }`, where `end` is the index just past the
 *  flags, or null if `start` does not begin a literal.
 *
 *  The whole reason this is hand-written rather than a regex is the character class.
 *  Workbox's emitted routes contain `/\/assets\/d\/[^/]+\.js$/` — an UNESCAPED `/`
 *  inside `[...]`, which is legal in a literal and which any "scan to the next slash"
 *  parser truncates into `/\/assets\/d\/[^/` — a valid regex that matches nothing we
 *  have. The lane would then claim zero files, and a partition check whose lanes claim
 *  nothing reports every chunk as uncovered (loud, recoverable) or, worse in a future
 *  refactor, reports nothing at all. So track class state and backslash escapes. */
export function readRegexLiteral(src, start) {
  if (src[start] !== '/') return null
  let i = start + 1
  let inClass = false
  while (i < src.length) {
    const c = src[i]
    if (c === '\\') {
      i += 2 // an escape consumes the next char whatever it is, including / and ]
      continue
    }
    // A literal cannot span a line, and an empty body is a `//` comment, not a regex.
    if (c === '\n') return null
    if (inClass) {
      if (c === ']') inClass = false
    } else if (c === '[') {
      inClass = true
    } else if (c === '/') {
      if (i === start + 1) return null // `//`
      let j = i + 1
      while (j < src.length && /[dgimsuvy]/.test(src[j])) j++
      return { body: src.slice(start + 1, i), flags: src.slice(i + 1, j), end: j }
    }
    i++
  }
  return null
}

/** The first regex literal in `src` that is immediately applied to something with
 *  `.test(` — i.e. a route's `urlPattern`, not some other literal that happens to
 *  appear earlier.
 *
 *  Requiring the `.test(` is what makes a left-to-right scan safe: a mis-started parse
 *  would have to produce a syntactically valid literal ending exactly where a `.test(`
 *  begins.
 *
 *  Returns null rather than throwing when nothing readable is found, because the caller
 *  turns that into a loud "no readable urlPattern" — so a body that does not COMPILE
 *  has to take the same exit, not escape as a SyntaxError from a build script. Two
 *  reachable inputs do exactly that: `/[[a]/]/v` (see the `v`-flag limitation below)
 *  and a mis-parse that scoops up trailing identifier characters as flags (`'gg'`).
 *
 *  `g` and `y` are STRIPPED. A lane's pattern is `.test()`ed once per emitted file, and
 *  a sticky or global regex carries `lastIndex` between those calls, so results would
 *  alternate — the under-claiming direction is loud (`uncovered`), but the over-claim
 *  it hides is not: a file both precached and runtime-routed could evade `doubly`.
 *  Neither flag can change which URLs a fully-anchored route pattern matches, so
 *  dropping them is free.
 *
 *  ⚠️ KNOWN LIMITATION: `inClass` is a boolean, so a `v`-flag NESTED class (`[[a]/b]`)
 *  ends the class one `]` early and the following `/` reads as the terminator. Fixing
 *  it properly needs the flags, which are not known until the literal has been parsed.
 *  Workbox cannot emit that today — it compiles our own config's regexes verbatim, and
 *  nested classes require `v` — so the crash path is closed and the shape is documented
 *  rather than handled. */
export function findPathnameTest(src) {
  for (let i = src.indexOf('/'); i >= 0; i = src.indexOf('/', i + 1)) {
    const lit = readRegexLiteral(src, i)
    if (!lit) continue
    if (!src.startsWith('.test(', lit.end)) continue
    try {
      return new RegExp(lit.body, lit.flags.replace(/[gy]/g, ''))
    } catch {
      continue // not a compilable literal after all — keep looking
    }
  }
  return null
}

/** The source text of the FIRST argument to a `registerRoute(` call, given the segment
 *  that follows the open paren. Ends at the top-level comma (or the closing paren).
 *
 *  A depth counter over `()[]{}`, skipping string and regex literals so a comma or a
 *  bracket inside one cannot end the argument early. */
export function readFirstArg(seg) {
  let depth = 0
  let i = 0
  // Where a `/` may legally begin a regex rather than mean division. Anything else and
  // we treat it as an operator, which for minified route code is always right.
  const REGEX_OK = /[(,=&|!:?[{;+\-*%<>~^]/
  const prevMeaningful = () => {
    for (let k = i - 1; k >= 0; k--) if (!/\s/.test(seg[k])) return seg[k]
    return ''
  }
  while (i < seg.length) {
    const c = seg[i]
    if (c === '"' || c === "'" || c === '`') {
      i++
      while (i < seg.length && seg[i] !== c) i += seg[i] === '\\' ? 2 : 1
      i++
      continue
    }
    if (c === '/' && (i === 0 || REGEX_OK.test(prevMeaningful()))) {
      const lit = readRegexLiteral(seg, i)
      if (lit) {
        i = lit.end
        continue
      }
    }
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return seg.slice(0, i)
      depth--
    } else if (c === ',' && depth === 0) return seg.slice(0, i)
    i++
  }
  return null
}

/** Turn a route's first argument — as SOURCE TEXT from the emitted worker — into an
 *  `(href) => boolean`, matching workbox's own semantics for each capture form. Returns
 *  null if the argument is not one it recognises, so the caller can fail loudly rather
 *  than silently claim nothing.
 *
 *  On `new Function`: the input is `dist/sw.js`, which this repo's own build just
 *  produced from its own config — the same trust boundary `check-preload.mjs` already
 *  works inside when it runs the shipped preload script. It is never given anything
 *  from a network or a user.
 *
 *  ⚠️ This EVALUATES the shipped predicate rather than extracting a regex out of it,
 *  and that distinction is the whole point. The first version pulled out the first
 *  regex literal followed by `.test(` — which silently discards every other conjunct.
 *  Narrow the route to `… && !url.pathname.includes('boxcar2d')` and the largest
 *  diversion chunk is cached by nothing while this check prints 137 claimed and exits
 *  0: the exact "the config is the intent, sw.js is what shipped" bug the file claims
 *  to exist for, passing green. It also rejected two of workbox's three documented
 *  capture forms (a bare RegExp, a bare string) as unreadable.
 *
 *  Running the code is the same move `check-preload.mjs` already makes on the shipped
 *  preload script: for build output we generated ourselves, `new Function` is the only
 *  reading that cannot disagree with what runs. */
export function compileCapture(src) {
  let value
  try {
    value = new Function(`return (${src})`)()
  } catch {
    return null
  }
  if (typeof value === 'function') {
    // workbox calls this with { url, request, event, sameOrigin }. Everything in dist/
    // is same-origin by construction. A callback that reaches for something we cannot
    // supply (request.destination) throws, and an unreadable lane fails loudly.
    return (href) => {
      try {
        return !!value({ url: new URL(href), sameOrigin: true, request: undefined, event: undefined })
      } catch {
        return false
      }
    }
  }
  // RegExpRoute tests url.href, NOT url.pathname, and for a same-origin request any
  // match position counts (the index === 0 rule only applies cross-origin).
  if (value instanceof RegExp) {
    const re = new RegExp(value.source, value.flags.replace(/[gy]/g, ''))
    return (href) => re.test(href)
  }
  // A string capture is an exact URL match, resolved against the page.
  if (typeof value === 'string') return (href) => href === value
  return null
}

/** Every runtime-caching route the emitted service worker actually registers, IN
 *  REGISTRATION ORDER — which is load-bearing, because workbox routing is strictly
 *  first-match-wins (`Router.findMatchingRoute` returns on the first match).
 *
 *  Read from `dist/sw.js` rather than from `vite.config.ts`. The config is the INTENT;
 *  sw.js is what shipped, and a route the plugin dropped or reordered still reads
 *  correctly in the config. That provenance is only worth having because `compileCapture`
 *  above evaluates the predicate exactly — parsing a fragment out of it gave up the
 *  fidelity that made reading the emitted file better in the first place.
 *
 *  Splitting on `registerRoute(` is order-safe under minification: each segment runs to
 *  the next route, so the `cacheName` and capture found inside one belong to it. The
 *  NavigationRoute carries no `cacheName` and is skipped — it serves navigations from
 *  the precached shell and claims no emitted file of its own.
 *
 *  `maxEntries` comes along because it is a CORRECTNESS bound, not a budget: workbox's
 *  ExpirationPlugin deletes past it as entries are written, so a lane holding more files
 *  than its cap silently loses the overflow — see the caller. */
export function extractRuntimeLanes(sw) {
  const lanes = []
  for (const part of sw.split('registerRoute(').slice(1)) {
    const cacheName = /cacheName:\s*["']([^"']+)["']/.exec(part)?.[1]
    if (!cacheName) continue
    const arg = readFirstArg(part)
    const maxEntries = /maxEntries:\s*(\d+)/.exec(part)?.[1]
    lanes.push({
      cacheName,
      matches: arg === null ? null : compileCapture(arg),
      maxEntries: maxEntries === undefined ? null : Number(maxEntries),
    })
  }
  return lanes
}

/** Precache entries, as dist-relative URLs, out of the minified manifest in sw.js. */
export function extractPrecache(sw) {
  return [...sw.matchAll(/url:\s*["']([^"']+)["']/g)].map((m) => m[1])
}

/** Assign every emitted file to the lane that will actually STORE it.
 *
 *  `files` are dist-relative (`assets/d/foo-abc.js`); captures match on a full URL, so
 *  they are given `origin + base + file` — what the browser will really ask for. Passing
 *  the real base rather than a bare `/` keeps this honest about the deployed shape: a
 *  pattern anchored at the root would pass here and claim nothing on Pages.
 *
 *  ## Ownership is FIRST MATCH, not "every lane that would match"
 *
 *  Workbox routing is strictly first-match-wins: `Router.findMatchingRoute` iterates its
 *  routes and returns on the first hit, and `precacheAndRoute` registers ahead of every
 *  `registerRoute`. So a file matched by two lanes is stored ONCE, by the earlier one.
 *
 *  The first version of this treated any second match as a failure — "two lanes storing
 *  the same bytes doubles the space and lets the copies diverge" — which is simply not
 *  what happens. It made a legitimate configuration (a narrow route registered before a
 *  broad one, the ordinary way to give one big asset its own cache) fail with a reason
 *  that was factually wrong. Overlap is reported as SHADOWING, for information; what
 *  fails is a file with no owner at all, and a lane that ends up owning nothing.
 *
 *  `exempt` entries participate as owners, last. That is the difference between "we
 *  decided this file is not worth caching" and "nobody noticed this file": a new emitted
 *  asset has no owner and fails until someone writes down why. A file that is BOTH
 *  exempt and cached is still a contradiction worth failing on, so it is reported
 *  separately — the exemption cannot win, since it is consulted last. */
export function classifyAssets({ files, base, origin = 'https://example.invalid', precache, lanes, exempt = [] }) {
  const precached = new Set(precache)
  const owner = new Map()
  const shadowedBy = new Map()
  const contradicted = []

  for (const file of files) {
    const href = origin + base + file
    const hits = []
    if (precached.has(file)) hits.push('precache')
    for (const lane of lanes) if (lane.matches?.(href)) hits.push(`runtime:${lane.cacheName}`)
    const exemptRule = exempt.find((r) => r.pattern.test(file))
    if (exemptRule) {
      if (hits.length) contradicted.push(file)
      else hits.push(`uncached:${exemptRule.why}`)
    }
    owner.set(file, hits[0] ?? null)
    if (hits.length > 1) shadowedBy.set(file, hits)
  }

  const ownedBy = (label) => files.filter((f) => owner.get(f) === label)
  return {
    owner,
    shadowedBy,
    contradicted,
    uncovered: files.filter((f) => owner.get(f) === null),
    ownedBy,
    /** Files a runtime route owns — the set "keep the gallery offline" must warm,
     *  because nothing else will ever put them in a cache. */
    runtime: files.filter((f) => (owner.get(f) ?? '').startsWith('runtime:')),
  }
}

/** The dist-relative files `offlineWarm.collectTargets` would fetch, given the map the
 *  build published and the sprite manifest.
 *
 *  ⚠️ This RE-DERIVES what `src/framework/offlineWarm.ts` derives; it cannot import it
 *  (CI is Node 20, that file is TypeScript). So it is deliberately kept to the same
 *  three lines the original is — chunk per slug, plus `extras`, plus the sprite
 *  manifest and one PNG per credited slug — and the caller asserts the result is not
 *  implausibly small. If the derivation over there grows a fourth source, this is the
 *  second place it has to land.
 *
 *  `credits` is the PARSED manifest, or `null` when there is none. The distinction is
 *  load-bearing and got mis-copied once: `collectTargets` pushes `credits.json` itself
 *  from inside `if (res.ok)`, AFTER `await res.json()` has succeeded — so it is warmed
 *  whenever the manifest fetches and parses, whatever is in it, including `[]` and a
 *  shape with no slugs at all. Gating it on "we found sprites" instead made this report
 *  `credits.json` as unwarmed for an empty manifest: still a loud failure, but pointing
 *  at the wrong file, which is worse than none. */
export function warmTargets({ slugs = {}, extras = [], credits = null }) {
  const sprites = Array.isArray(credits)
    ? credits.map((c) => c?.slug).filter((s) => typeof s === 'string')
    : []
  return [
    ...Object.values(slugs).map((entry) => String(entry[0])),
    ...extras,
    ...(credits === null ? [] : ['pictures/credits.json']),
    ...sprites.map((s) => `pictures/${s}.png`),
  ]
}
