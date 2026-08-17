import { describe, expect, it } from 'vitest'
import {
  classifyAssets,
  compileCapture,
  extractPrecache,
  extractRuntimeLanes,
  findPathnameTest,
  readFirstArg,
  readRegexLiteral,
  warmTargets,
} from './cacheLanes.mjs'

/* A hand-built stand-in for `dist/sw.js`, copied from real minified workbox output
 * (#296). Written out rather than read from dist/ on purpose: the parser's job is to
 * survive this exact SHAPE, and a test that reads the current build would go green
 * against whatever the build happens to emit — including the degenerate cases below. */
const SW = [
  'self.addEventListener("message",...),s.precacheAndRoute([',
  '{url:"index.html",revision:"a1"},{url:"assets/index-X.js",revision:null},',
  '{url:"assets/index-X.css",revision:null},{url:"favicon.svg",revision:"b2"}',
  '],{}),s.cleanupOutdatedCaches(),',
  's.registerRoute(new s.NavigationRoute(s.createHandlerBoundToURL("index.html"))),',
  's.registerRoute(({url:s,sameOrigin:e})=>e&&/\\/assets\\/d\\/[^/]+\\.js$/.test(s.pathname),',
  'new s.CacheFirst({cacheName:"diversion-chunks-v1",plugins:[new s.ExpirationPlugin({maxEntries:220})]}),"GET"),',
  's.registerRoute(({url:s,sameOrigin:e})=>e&&/\\/pictures\\/[^/]+$/.test(s.pathname),',
  'new s.StaleWhileRevalidate({cacheName:"diversion-pictures-v1",plugins:[new s.ExpirationPlugin({maxEntries:40})]}),"GET")',
].join('')

describe('readRegexLiteral', () => {
  it('reads a literal whose character class contains an unescaped slash', () => {
    // THE trap. `/\/assets\/d\/[^/]+\.js$/` is what workbox emits, and a parser that
    // scans to the next slash truncates it to `/\/assets\/d\/[^/` — still a valid
    // regex, so nothing throws; it simply matches none of the 137 chunks.
    const src = '/\\/assets\\/d\\/[^/]+\\.js$/.test(x)'
    const lit = readRegexLiteral(src, 0)
    expect(lit).not.toBeNull()
    expect(new RegExp(lit.body).test('/diversion/assets/d/ablation-abc.js')).toBe(true)
    expect(src.slice(lit.end)).toBe('.test(x)')
  })

  it('does not end the literal on an escaped slash or an escaped class close', () => {
    const lit = readRegexLiteral('/a\\/b[x\\]y]c/g;', 0)
    expect(lit.body).toBe('a\\/b[x\\]y]c')
    expect(lit.flags).toBe('g')
  })

  it('rejects a line comment, a non-slash start, and an unterminated literal', () => {
    expect(readRegexLiteral('// not a regex\n', 0)).toBeNull()
    expect(readRegexLiteral('x/abc/', 0)).toBeNull()
    expect(readRegexLiteral('/abc', 0)).toBeNull()
    expect(readRegexLiteral('/ab\nc/', 0)).toBeNull()
  })
})

describe('findPathnameTest', () => {
  it('skips earlier literals that are not applied with .test(', () => {
    const src = 'x.replace(/^a/,"b");y=/\\/pictures\\/[^/]+$/.test(p)'
    const re = findPathnameTest(src)
    expect(re.test('/diversion/pictures/axe.png')).toBe(true)
    expect(re.test('/diversion/assets/index-X.js')).toBe(false)
  })

  it('returns null when the pattern is built with the RegExp constructor', () => {
    // A workbox major could compile `urlPattern` differently. Returning null lets the
    // caller fail loudly ("no readable urlPattern") instead of silently claiming zero.
    expect(findPathnameTest('e&&new RegExp("/assets/").test(s.pathname)')).toBeNull()
  })

  it('returns null rather than THROWING on a body or flags that will not compile', () => {
    // The stated contract is "null so the caller fails loudly", and a build script that
    // dies with a SyntaxError instead is not that. Both inputs reach `new RegExp`: the
    // first via the v-flag nested-class limitation, the second by scooping identifier
    // characters up as flags.
    expect(() => findPathnameTest(String.raw`e&&/[[a]/]/v.test(s.pathname)`)).not.toThrow()
    expect(() => findPathnameTest('a/gg.test(b)/gg.test(c)')).not.toThrow()
  })

  it('strips g and y so a lane pattern cannot become stateful across .test() calls', () => {
    // A lane is .test()ed once per emitted file, three separate times over the same
    // object. With `g`, lastIndex persists and the answers alternate — and the
    // over-claiming direction is silent: a doubly-cached file could evade `doubly`.
    const re = findPathnameTest(String.raw`e&&/\/assets\/d\/[^/]+\.js$/g.test(p)`)
    expect(re.flags).toBe('')
    const url = '/diversion/assets/d/aurora-abc.js'
    expect([re.test(url), re.test(url), re.test(url)]).toEqual([true, true, true])
  })
})

const CHUNK = 'https://x.invalid/diversion/assets/d/aurora-abc.js'
const PIC = 'https://x.invalid/diversion/pictures/axe.png'

describe('compileCapture', () => {
  it('honours EVERY conjunct of a callback, not just its first regex', () => {
    // The defect this replaced: extracting the first `/…/.test(` literal silently drops
    // the rest of the predicate. Narrowing the real route this way left the largest
    // diversion chunk cached by nothing while the check printed 137 claimed and exited
    // 0 — the exact "config is intent, sw.js is what shipped" bug it exists to catch.
    const narrowed = compileCapture(
      String.raw`({url:s,sameOrigin:e})=>e&&/\/assets\/d\/[^/]+\.js$/.test(s.pathname)&&!s.pathname.includes("aurora")`,
    )
    expect(narrowed(CHUNK)).toBe(false)
    expect(narrowed('https://x.invalid/diversion/assets/d/boids-def.js')).toBe(true)
  })

  it('accepts a bare RegExp capture, matched against href as workbox does', () => {
    // workbox's other two documented capture forms. The literal-extraction version
    // rejected both as unreadable, failing a legitimate config with 27 uncovered files.
    const re = compileCapture(String.raw`/\/pictures\/[^/]+$/`)
    expect(re(PIC)).toBe(true)
    expect(re(CHUNK)).toBe(false)
  })

  it('accepts a string capture as an exact URL match', () => {
    const s = compileCapture(JSON.stringify(PIC))
    expect(s(PIC)).toBe(true)
    expect(s(CHUNK)).toBe(false)
  })

  it('returns null for anything it does not recognise, and never throws', () => {
    expect(compileCapture('new SomeRoute(')).toBeNull()
    expect(compileCapture('{ not: "a capture" }')).toBeNull()
    // A callback reaching for something we cannot supply must not take the build down.
    const needsRequest = compileCapture('({request})=>request.destination==="script"')
    expect(() => needsRequest(CHUNK)).not.toThrow()
    expect(needsRequest(CHUNK)).toBe(false)
  })
})

describe('readFirstArg', () => {
  it('stops at the top-level comma, not one inside a literal or a nested call', () => {
    expect(readFirstArg('({a:1,b:2}),new X({c:3}),"GET")')).toBe('({a:1,b:2})')
    expect(readFirstArg('"a,b",rest)')).toBe('"a,b"')
    expect(readFirstArg(String.raw`/[a,/]+/.test(p),rest)`)).toBe(String.raw`/[a,/]+/.test(p)`)
  })
})

describe('extractRuntimeLanes / extractPrecache', () => {
  it('reads each route with its own cacheName, skipping the NavigationRoute', () => {
    const lanes = extractRuntimeLanes(SW)
    expect(lanes.map((l) => l.cacheName)).toEqual([
      'diversion-chunks-v1',
      'diversion-pictures-v1',
    ])
    expect(lanes[0].matches(CHUNK)).toBe(true)
    expect(lanes[0].matches(PIC)).toBe(false)
    expect(lanes[1].matches(PIC)).toBe(true)
  })

  it('pairs each capture with the route it belongs to, not the one before it', () => {
    // Splitting on `registerRoute(` is what makes this true. A "nearest cacheName to
    // the regex" reading picks up the PRECEDING route's name once the order changes —
    // the same mistake check-pwa.mjs's first strategy reader made.
    const [chunks, pictures] = extractRuntimeLanes(SW)
    expect(chunks.matches(CHUNK)).toBe(true)
    expect(pictures.matches(CHUNK)).toBe(false)
  })

  it('carries maxEntries, because it is a correctness bound and nothing else reads it', () => {
    // ExpirationPlugin deletes past maxEntries as entries are WRITTEN, so a lane over
    // its cap silently loses the overflow — and the offline control still reports a
    // green tick over a copy that is missing files.
    expect(extractRuntimeLanes(SW).map((l) => l.maxEntries)).toEqual([220, 40])
  })

  it('reads the precache manifest urls', () => {
    expect(extractPrecache(SW)).toEqual([
      'index.html',
      'assets/index-X.js',
      'assets/index-X.css',
      'favicon.svg',
    ])
  })
})

describe('classifyAssets', () => {
  const lanes = extractRuntimeLanes(SW)
  const precache = extractPrecache(SW)
  const base = '/diversion/'
  const origin = 'https://x.invalid'
  const of = (files, extra = {}) =>
    classifyAssets({ files, base, origin, precache, lanes, ...extra })

  it('gives every file an owning lane when the partition is total', () => {
    const files = ['index.html', 'assets/index-X.js', 'assets/d/aurora-abc.js', 'pictures/axe.png']
    const r = of(files)
    expect(r.uncovered).toEqual([])
    expect(r.contradicted).toEqual([])
    expect(r.runtime).toEqual(['assets/d/aurora-abc.js', 'pictures/axe.png'])
    expect(r.owner.get('assets/d/aurora-abc.js')).toBe('runtime:diversion-chunks-v1')
  })

  it('flags a new asset lane nobody claimed — the #296 hazard', () => {
    expect(of(['index.html', 'assets/weights-abc.bin']).uncovered).toEqual([
      'assets/weights-abc.bin',
    ])
  })

  it('treats an UNCACHED declaration as an owner, not as a skip', () => {
    const exempt = [{ pattern: /^sw\.js$/, why: 'the worker itself' }]
    expect(of(['sw.js']).uncovered).toEqual(['sw.js'])
    expect(of(['sw.js'], { exempt }).uncovered).toEqual([])
    expect(of(['sw.js'], { exempt }).owner.get('sw.js')).toBe('uncached:the worker itself')
  })

  it('flags a file that is both cached and declared UNCACHED', () => {
    const exempt = [{ pattern: /^index\.html$/, why: 'contradicts the precache' }]
    const r = of(['index.html'], { exempt })
    expect(r.contradicted).toEqual(['index.html'])
    // The exemption is consulted last and cannot win, so the real storer still owns it.
    expect(r.owner.get('index.html')).toBe('precache')
  })

  it('assigns an overlapping file to the FIRST lane, and does not call that an error', () => {
    // Workbox routing is first-match-wins, so a narrow route ahead of a broad one — the
    // ordinary way to give one big asset its own cache — stores the bytes ONCE. Failing
    // it with "two lanes doubles the space" was a factually wrong rejection of a
    // legitimate config.
    const big = { cacheName: 'big-v1', matches: (h) => h.includes('boxcar2d'), maxEntries: 5 }
    const r = of(['assets/d/boxcar2d-x.js'], { lanes: [big, ...lanes] })
    expect(r.uncovered).toEqual([])
    expect(r.owner.get('assets/d/boxcar2d-x.js')).toBe('runtime:big-v1')
    expect(r.shadowedBy.get('assets/d/boxcar2d-x.js')).toEqual([
      'runtime:big-v1',
      'runtime:diversion-chunks-v1',
    ])
    // ...and the shadowed-out lane still owns everything else, so it is not dead.
    expect(r.ownedBy('runtime:diversion-chunks-v1')).toEqual([])
  })

  it('matches captures against the full deployed URL, not a bare path', () => {
    // A pattern anchored with `^https://x.invalid/assets` would pass a bare-slash check
    // and then own nothing on Pages, where every path starts /diversion/.
    const rooted = [{ cacheName: 'rooted', matches: (h) => /x\.invalid\/assets\/d\//.test(h) }]
    const files = ['assets/d/aurora-abc.js']
    expect(of(files, { lanes: rooted, precache: [] }).uncovered).toEqual(files)
    expect(
      classifyAssets({ files, base: '/', origin, precache: [], lanes: rooted }).uncovered,
    ).toEqual([])
  })

  it('survives a lane whose capture could not be compiled', () => {
    const r = of(['assets/d/aurora-abc.js'], {
      precache: [],
      lanes: [{ cacheName: 'broken', matches: null, maxEntries: null }],
    })
    expect(r.uncovered).toEqual(['assets/d/aurora-abc.js'])
  })
})

describe('warmTargets', () => {
  it('takes one chunk per slug, the extras, and a sprite per credit', () => {
    expect(
      warmTargets({
        slugs: { aurora: ['assets/d/aurora-abc.js', 0, 1], boids: ['assets/d/boids-def.js'] },
        extras: ['assets/models-ghi.json'],
        credits: [{ slug: 'axe' }, { slug: 'helm' }],
      }),
    ).toEqual([
      'assets/d/aurora-abc.js',
      'assets/d/boids-def.js',
      'assets/models-ghi.json',
      'pictures/credits.json',
      'pictures/axe.png',
      'pictures/helm.png',
    ])
  })

  it('warms the manifest itself whenever it PARSED, even with no usable slug in it', () => {
    // collectTargets pushes credits.json from inside `if (res.ok)`, after `res.json()`
    // resolved — not from inside the branch that found sprites. Gating it on
    // `sprites.length` made an empty manifest report credits.json as unwarmed: a loud
    // failure pointing at the wrong file, which is worse than no check at all.
    expect(warmTargets({ credits: [] })).toEqual(['pictures/credits.json'])
    expect(warmTargets({ credits: [{ title: 'no slug' }, null] })).toEqual([
      'pictures/credits.json',
    ])
    expect(warmTargets({ credits: 'not an array' })).toEqual(['pictures/credits.json'])
  })

  it('omits the manifest only when there is none to fetch', () => {
    // `null` is "no manifest" — the case where collectTargets' fetch fails or 404s and
    // the whole sprite branch is skipped.
    expect(warmTargets({ credits: null })).toEqual([])
    expect(warmTargets({ slugs: { a: ['assets/d/a.js'] } })).toEqual(['assets/d/a.js'])
  })
})
