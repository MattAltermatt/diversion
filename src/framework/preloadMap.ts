/** Build-time only (#291). Imported by `vite.config.ts`, never by the app — nothing
 *  here reaches a browser as a module. What ships is the single inline script
 *  `preloadScript()` returns: ~350 B of code wrapped around the map, which for 137
 *  diversions measures **8.1 kB raw / 3.0 kB gzipped**, taking index.html from 1.3 kB
 *  to 4.2 kB gzipped. That is the number the design turns on — it is paid on every
 *  visit, gallery included, and it is only free because it stays inside the first
 *  congestion window (~14 kB).
 *
 *  ## The problem
 *
 *  Since #288 a cold, direct load of `/d/<slug>/play` has a serial third hop:
 *
 *      HTML  ->  entry chunk  ->  the diversion's chunk (+ its shared deps)
 *
 *  measured at +613 ms median / +961 ms worst against a 590 ms RTT on Slow 4G. The
 *  split is still hugely net-positive (615 kB -> ~155 kB gzipped), but that last hop
 *  is pure latency, and a deep link is exactly how a diversion gets SHARED.
 *
 *  ## Why the map has to carry deps, not just the chunk
 *
 *  The tempting version — preload only `assets/d/<slug>-<hash>.js` — saves nothing
 *  measurable. Vite's `__vitePreload` already injects `modulepreload` for a dynamic
 *  import's static deps at import time, so the third hop is ONE round trip carrying
 *  the chunk and its deps together. Removing the chunk from that batch leaves the
 *  batch. What actually collapses the hop is preloading the chunk AND every static
 *  dep the HTML does not already preload — `schemas`, `rng`, `color`, `matrix`,
 *  `webgpu`, and so on. (The entry and `metas` ARE already preloaded by Vite; they
 *  are subtracted, or every deep link would re-request them.)
 *
 *  ## Shape
 *
 *  Deps are shared across the 137 pieces, so they live in one table and each slug
 *  carries indices into it. That is what keeps the payload at ~3 kB gzipped instead
 *  of ~12 kB of repeated filenames — and it is paid on every visit, gallery included,
 *  so the compactness is the point. */

/** The subset of a rollup output chunk this needs. Declared structurally rather than
 *  imported from rollup so the unit test can build a bundle by hand. */
export interface PreloadChunk {
  type: string
  fileName: string
  facadeModuleId?: string | null
  /** STATIC imports only. `dynamicImports` is deliberately not followed: those are
   *  the lazy edges, and following them would preload the whole gallery. */
  imports?: string[]
  isEntry?: boolean
}

export interface PreloadMap {
  /** Shared chunk file names, referenced by index from `slugs`. */
  deps: string[]
  /** slug -> [its own chunk fileName, ...indices into `deps`]. */
  slugs: Record<string, (string | number)[]>
  /** Emitted assets that are RUNTIME-cached rather than precached, and that no
   *  diversion chunk statically imports — today just neural-ca's 1.17 MB weight file,
   *  which it fetches by `?url` at run time. Nothing preloads these (they belong to
   *  one piece, and only once it starts); they are here because this map is the only
   *  place in the app that knows the emitted, content-hashed filename of every
   *  runtime asset, which is exactly what "keep the whole gallery offline" (#293)
   *  needs to enumerate. */
  extras: string[]
}

const SLUG_OF_FACADE = /\/src\/diversions\/([^/]+)\/index\.ts$/

/** Every chunk reachable from `start` through STATIC imports, including `start`. */
function staticClosure(bundle: Record<string, PreloadChunk>, start: string): Set<string> {
  const seen = new Set<string>()
  const queue = [start]
  while (queue.length) {
    const name = queue.pop() as string
    if (seen.has(name)) continue
    seen.add(name)
    for (const imp of bundle[name]?.imports ?? []) if (!seen.has(imp)) queue.push(imp)
  }
  return seen
}

/** Derive the slug -> preload-set map from a finished rollup bundle.
 *
 *  Returns an EMPTY map rather than throwing when it recognises nothing — a build
 *  that silently stops emitting diversion chunks is a different bug, and the
 *  post-build check (`npm run check:preload`) is what fails on it. Throwing here
 *  would turn every unrelated harness (a test build, a future single-page build)
 *  into a broken build. */
export function buildPreloadMap(bundle: Record<string, PreloadChunk>): PreloadMap {
  const chunks = Object.values(bundle).filter((c) => c.type === 'chunk')
  const entry = chunks.find((c) => c.isEntry)
  // What index.html already carries: Vite emits <link rel=modulepreload> for the
  // entry's static closure. Re-listing any of it would issue a duplicate request.
  const alreadyPreloaded = entry ? staticClosure(bundle, entry.fileName) : new Set<string>()

  const deps: string[] = []
  const indexOfDep = (file: string): number => {
    const at = deps.indexOf(file)
    if (at >= 0) return at
    deps.push(file)
    return deps.length - 1
  }

  // JSON emitted under assets/ is data a diversion fetches at run time, never
  // precached (globPatterns takes `assets/*.{js,css}` only). Sorted for a stable map.
  const extras = Object.values(bundle)
    .filter((c) => c.type === 'asset' && /^assets\/[^/]+\.json$/.test(c.fileName))
    .map((c) => c.fileName)
    .sort()

  const slugs: Record<string, (string | number)[]> = {}
  for (const chunk of chunks) {
    const slug = chunk.facadeModuleId?.match(SLUG_OF_FACADE)?.[1]
    if (!slug) continue
    const needed = [...staticClosure(bundle, chunk.fileName)]
      .filter((f) => f !== chunk.fileName && !alreadyPreloaded.has(f))
      .sort() // stable output: a hash-only change must not reorder the map
    slugs[slug] = [chunk.fileName, ...needed.map(indexOfDep)]
  }
  return { deps, slugs, extras }
}

/** The inline script injected into index.html. Reads the slug out of the URL and
 *  appends the preload links for that one diversion.
 *
 *  Written as ES5-flavoured, single-statement JS on purpose: it runs before anything
 *  else on the page, on whatever browser opened the link, and a syntax error here
 *  would take the whole document down rather than degrade. It also does nothing at
 *  all on the gallery — the diversion route is the only one with anything to preload.
 *
 *  `segment` is the route's path segment, passed in rather than spelled here: it is
 *  duplicated from React Router's route definitions, and a rename that missed this
 *  regex would leave the map shipping while no link is ever created, with every gate
 *  green. `framework/routes.ts` is the single spelling both sides read.
 *
 *  `crossOrigin = ''` is load-bearing: Vite's own modulepreload links carry
 *  `crossorigin`, and a link whose credentials mode differs from the eventual
 *  `import()` does not satisfy it — the browser fetches the file a SECOND time, so
 *  the "optimisation" would cost bytes on every deep link. */
export function preloadScript(map: PreloadMap, base: string, segment: string): string {
  const json = JSON.stringify([map.deps, map.slugs, map.extras])
  return (
    '(function(){try{' +
    `var B=${JSON.stringify(base)},X=${json},D=X[0],M=X[1];` +
    // Republish the map BEFORE the early returns: the gallery takes the first of them,
    // and the gallery is exactly where "keep the whole gallery offline" (#293) reads
    // it. The alternative is a second enumeration of 137 content-hashed filenames —
    // duplicated bytes, and a second thing that has to stay true.
    'window.__diversionAssets=X;' +
    // Strip the base FIRST, then anchor at the start. A free-floating /d/ match reads
    // the base's own segments: under base "/d/" the path "/d/d/ablation/play" matches
    // at index 0 and yields the slug "d". Caught by a unit test, not by inspection.
    'var p=location.pathname;p=p.slice(p.indexOf(B)===0?B.length:1);' +
    `var m=/^${segment}\\/([^/?#]+)/.exec(p);if(!m)return;` +
    'var e=M[decodeURIComponent(m[1])];if(!e)return;' +
    'for(var i=0;i<e.length;i++){' +
    'var l=document.createElement("link");' +
    'l.rel="modulepreload";l.crossOrigin="";l.fetchPriority="low";l.href=B+(i?D[e[i]]:e[0]);' +
    'document.head.appendChild(l)}' +
    // A throw here would be the FIRST script in the document. decodeURIComponent
    // rejects a malformed escape ('%zz'), which a crawler or a hand-typed URL can
    // produce, and the file claims this degrades rather than failing loudly — so make
    // that true rather than merely intended.
    '}catch(e){}})()'
  )
}
