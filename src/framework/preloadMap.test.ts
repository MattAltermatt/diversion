import { describe, it, expect } from 'vitest'
import { buildPreloadMap, preloadScript, type PreloadChunk } from './preloadMap'
import { DIVERSION_SEGMENT, diversionPath } from './routes'

/** A bundle shaped like the real one: an entry with two static deps, three diversion
 *  chunks with overlapping shared deps, and one asset that is not a chunk at all. */
const bundle: Record<string, PreloadChunk> = {
  'assets/index-AAA.js': {
    type: 'chunk',
    fileName: 'assets/index-AAA.js',
    isEntry: true,
    imports: ['assets/runtime-BBB.js', 'assets/metas-CCC.js'],
  },
  'assets/runtime-BBB.js': { type: 'chunk', fileName: 'assets/runtime-BBB.js', imports: [] },
  'assets/metas-CCC.js': { type: 'chunk', fileName: 'assets/metas-CCC.js', imports: [] },
  'assets/schemas-DDD.js': { type: 'chunk', fileName: 'assets/schemas-DDD.js', imports: [] },
  'assets/color-EEE.js': { type: 'chunk', fileName: 'assets/color-EEE.js', imports: [] },
  'assets/webgpu-FFF.js': { type: 'chunk', fileName: 'assets/webgpu-FFF.js', imports: [] },
  'assets/d/ablation-111.js': {
    type: 'chunk',
    fileName: 'assets/d/ablation-111.js',
    facadeModuleId: '/repo/src/diversions/ablation/index.ts',
    // Note it imports the ENTRY, exactly as the real chunks do.
    imports: ['assets/index-AAA.js', 'assets/schemas-DDD.js', 'assets/color-EEE.js'],
  },
  'assets/d/plasma-222.js': {
    type: 'chunk',
    fileName: 'assets/d/plasma-222.js',
    facadeModuleId: '/repo/src/diversions/plasma/index.ts',
    imports: ['assets/metas-CCC.js', 'assets/schemas-DDD.js'],
  },
  'assets/d/swarmalators-333.js': {
    type: 'chunk',
    fileName: 'assets/d/swarmalators-333.js',
    facadeModuleId: '/repo/src/diversions/swarmalators/index.ts',
    imports: ['assets/webgpu-FFF.js'],
  },
  'assets/index-GGG.css': { type: 'asset', fileName: 'assets/index-GGG.css' },
}

describe('buildPreloadMap (#291)', () => {
  it('finds one entry per diversion chunk, keyed by slug', () => {
    const map = buildPreloadMap(bundle)
    expect(Object.keys(map.slugs).sort()).toEqual(['ablation', 'plasma', 'swarmalators'])
    expect(map.slugs.ablation[0]).toBe('assets/d/ablation-111.js')
  })

  it('SUBTRACTS what index.html already preloads', () => {
    // Vite emits <link rel=modulepreload> for the entry's whole static closure. Listing
    // any of it again would issue a duplicate request on every deep link — the exact
    // opposite of the point.
    const map = buildPreloadMap(bundle)
    const files = new Set(map.deps)
    expect(files.has('assets/index-AAA.js')).toBe(false)
    expect(files.has('assets/runtime-BBB.js')).toBe(false)
    expect(files.has('assets/metas-CCC.js')).toBe(false)
    // plasma's only other import IS metas, so it needs just schemas.
    expect(map.slugs.plasma.slice(1).map((i) => map.deps[i as number])).toEqual([
      'assets/schemas-DDD.js',
    ])
  })

  it('carries each chunk DEPS, not just the chunk', () => {
    // Preloading the chunk alone saves nothing: __vitePreload asks for the deps in the
    // same round trip, so removing one file from that batch leaves the batch.
    const map = buildPreloadMap(bundle)
    const ablationDeps = map.slugs.ablation.slice(1).map((i) => map.deps[i as number])
    expect(ablationDeps.sort()).toEqual(['assets/color-EEE.js', 'assets/schemas-DDD.js'])
  })

  it('shares one deps table across slugs rather than repeating filenames', () => {
    // This is what keeps the payload at ~3 kB gzipped instead of ~12 kB, on every visit.
    const map = buildPreloadMap(bundle)
    expect(map.deps.filter((d) => d === 'assets/schemas-DDD.js')).toHaveLength(1)
  })

  it('is ordered by NAME, so a hash-only change cannot reorder the map', () => {
    // Comparing a pure function to itself is true for any implementation, sorted or
    // not. The property that matters is that re-hashing the same modules — which is
    // what a deploy does — produces the same order.
    const rehashed: Record<string, PreloadChunk> = {}
    const rename = (f: string) => f.replace(/-(\w+)\.js$/, '-ZZZ9.js')
    for (const [k, c] of Object.entries(bundle)) {
      rehashed[rename(k)] = {
        ...c,
        fileName: rename(c.fileName),
        imports: c.imports?.map(rename),
      }
    }
    const a = buildPreloadMap(bundle)
    const b = buildPreloadMap(rehashed)
    expect(b.deps.map(rename)).toEqual(a.deps.map(rename))
    expect(b.slugs.ablation.slice(1)).toEqual(a.slugs.ablation.slice(1))
  })

  it('returns an empty map rather than throwing when there are no diversion chunks', () => {
    // A test build or a future single-page harness must not become a broken build.
    // `npm run check:preload` is what fails if the real build stops emitting them.
    expect(buildPreloadMap({ 'a.js': { type: 'chunk', fileName: 'a.js', isEntry: true } })).toEqual(
      { deps: [], slugs: {} },
    )
  })

  it('does not follow DYNAMIC imports', () => {
    // Following them would preload the whole gallery from any one deep link.
    const withDynamic: Record<string, PreloadChunk> = {
      ...bundle,
      'assets/d/ablation-111.js': {
        ...bundle['assets/d/ablation-111.js'],
        imports: ['assets/schemas-DDD.js'],
        // deliberately present and deliberately ignored
        ...({ dynamicImports: ['assets/d/plasma-222.js'] } as object),
      },
    }
    const map = buildPreloadMap(withDynamic)
    expect(map.slugs.ablation).toHaveLength(2)
  })
})

describe('preloadScript (#291) — the code that actually ships', () => {
  /** Run the emitted script with `location`/`document` shadowed by stubs, and report
   *  the links it appended. Executes the real string, not a re-implementation. */
  const run = (pathname: string, base = '/diversion/') => {
    const map = buildPreloadMap(bundle)
    const appended: Record<string, string>[] = []
    const doc = {
      createElement: () => ({}) as Record<string, string>,
      head: { appendChild: (el: Record<string, string>) => appended.push(el) },
    }
    new Function('location', 'document', preloadScript(map, base, DIVERSION_SEGMENT))(
      { pathname },
      doc,
    )
    return appended
  }

  it('preloads the deep link’s diversion and its deps, base-prefixed', () => {
    // Path built from the ROUTER's segment, not a literal: renaming the route without
    // the script's regex would leave the map shipping and no link ever created.
    const links = run(`/diversion${diversionPath('ablation')}/play`)
    expect(links.map((l) => l.href).sort()).toEqual([
      '/diversion/assets/color-EEE.js',
      '/diversion/assets/d/ablation-111.js',
      '/diversion/assets/schemas-DDD.js',
    ])
    expect(links.every((l) => l.rel === 'modulepreload')).toBe(true)
  })

  it('matches the config route as well as /play', () => {
    expect(run(`/diversion${diversionPath('plasma')}`)).toHaveLength(2)
  })

  it('does nothing on the gallery', () => {
    // Every visit pays for this script; on the one route with no diversion to preload
    // it must not invent work.
    expect(run('/diversion/')).toHaveLength(0)
  })

  it('does nothing for a slug it does not know', () => {
    expect(run('/diversion/d/not-a-diversion/play')).toHaveLength(0)
  })

  it('carries crossorigin, or the browser fetches every file TWICE', () => {
    // Vite's own modulepreload links are crossorigin; a link whose credentials mode
    // differs from the eventual import() does not satisfy it.
    expect(run('/diversion/d/plasma').every((l) => l.crossOrigin === '')).toBe(true)
  })

  it('asks at LOW priority, so the shell is never starved of a connection', () => {
    // Measured on an HTTP/1.1 server (6 connections): at default priority these took
    // slots ahead of the entry's own deps and pushed first paint out by ~500 ms.
    expect(run('/diversion/d/plasma').every((l) => l.fetchPriority === 'low')).toBe(true)
  })

  it('decodes a percent-encoded slug', () => {
    expect(run('/diversion/d/%61blation/play')).toHaveLength(3)
  })

  it('is not confused by a base path that contains a d/ segment', () => {
    const links = run('/d/d/ablation/play', '/d/')
    expect(links.map((l) => l.href)).toContain('/d/assets/d/ablation-111.js')
  })
})
