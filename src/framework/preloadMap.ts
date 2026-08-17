/** Build-time only (#291). Imported by `vite.config.ts`, never by the app — nothing
 *  here reaches a browser as a module; the only thing that ships is the ~2 kB inline
 *  script `preloadScript()` returns.
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
 *  carries indices into it. That is what keeps the payload at ~2 kB gzipped instead
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

  const slugs: Record<string, (string | number)[]> = {}
  for (const chunk of chunks) {
    const slug = chunk.facadeModuleId?.match(SLUG_OF_FACADE)?.[1]
    if (!slug) continue
    const needed = [...staticClosure(bundle, chunk.fileName)]
      .filter((f) => f !== chunk.fileName && !alreadyPreloaded.has(f))
      .sort() // stable output: a hash-only change must not reorder the map
    slugs[slug] = [chunk.fileName, ...needed.map(indexOfDep)]
  }
  return { deps, slugs }
}

/** The inline script injected into index.html. Reads the slug out of the URL and
 *  appends the preload links for that one diversion.
 *
 *  Written as ES5-flavoured, single-statement JS on purpose: it runs before anything
 *  else on the page, on whatever browser opened the link, and a syntax error here
 *  would take the whole document down rather than degrade. It also does nothing at
 *  all on the gallery — `/d/` is the only route with a diversion to preload.
 *
 *  `crossOrigin = ''` is load-bearing: Vite's own modulepreload links carry
 *  `crossorigin`, and a link whose credentials mode differs from the eventual
 *  `import()` does not satisfy it — the browser fetches the file a SECOND time, so
 *  the "optimisation" would cost bytes on every deep link. */
export function preloadScript(map: PreloadMap, base: string): string {
  const json = JSON.stringify([map.deps, map.slugs])
  return (
    '(function(){' +
    `var B=${JSON.stringify(base)},X=${json},D=X[0],M=X[1];` +
    // Strip the base FIRST, then anchor at the start. A free-floating /d/ match reads
    // the base's own segments: under base "/d/" the path "/d/d/ablation/play" matches
    // at index 0 and yields the slug "d". Caught by a unit test, not by inspection.
    'var p=location.pathname;p=p.slice(p.indexOf(B)===0?B.length:1);' +
    'var m=/^d\\/([^/?#]+)/.exec(p);if(!m)return;' +
    'var e=M[decodeURIComponent(m[1])];if(!e)return;' +
    'for(var i=0;i<e.length;i++){' +
    'var l=document.createElement("link");' +
    'l.rel="modulepreload";l.crossOrigin="";l.fetchPriority="low";l.href=B+(i?D[e[i]]:e[0]);' +
    'document.head.appendChild(l)}' +
    '})()'
  )
}
