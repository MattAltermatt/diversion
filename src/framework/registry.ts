import { use } from 'react'
import type { Diversion, DiversionMeta } from './types'

// Two globs over the same 137 folders (#288).
//
//   meta.ts  — EAGER. Four string fields, no imports, ~300 B minified each. Stays in
//              the entry chunk so the gallery grid and the router can render on the
//              first paint without a network round-trip.
//   index.ts — LAZY (no `eager`). Rolldown emits one chunk per folder, fetched only
//              when a tile mounts a preview or a /d/<slug> route opens.
//
// Auto-discovery is intact — a new folder still needs no registration anywhere. It
// needs two files instead of one, and contract.test.ts enforces that by diffing the
// two globs' slug sets: a folder with index.ts but no meta.ts would otherwise vanish
// from the gallery and 404 its route, with no type error and nothing thrown.
//
// Why this split at all: eagerly importing all 137 implementations produced a single
// 1.91 MB / 615 kB gzipped entry chunk and a 5.2 s cold-cache LCP on Slow 4G, of
// which ~79% was simply downloading that chunk.
const metaModules = import.meta.glob<{ meta: DiversionMeta }>('../diversions/*/meta.ts', {
  eager: true,
})
const indexModules = import.meta.glob<{ default: Diversion }>('../diversions/*/index.ts')

const metas: DiversionMeta[] = Object.values(metaModules)
  .map((m) => m.meta)
  .sort((a, b) => a.title.localeCompare(b.title))

const slugOf = (p: string) => p.replace(/.*\/diversions\/([^/]+)\/index\.ts$/, '$1')
const loaders = new Map(Object.entries(indexModules).map(([p, load]) => [slugOf(p), load]))

const loaded = new Map<string, Diversion>()
// Promises are memoized so `use()` sees a STABLE promise per id: use() re-runs the
// render that suspended, so an unmemoized call would hand it a fresh promise every
// time and suspend forever. Same reason loadDiversion is not declared `async` — an
// async function allocates a new promise per call even on the cache-hit path.
const pending = new Map<string, Promise<Diversion | undefined>>()

/** Every diversion's identity, title-sorted. Synchronous and complete — this is what
 *  the gallery lays 137 tiles out from, with no code loaded. */
export function listDiversions(): DiversionMeta[] {
  return metas
}

export function getDiversionMeta(id: string): DiversionMeta | undefined {
  return metas.find((m) => m.id === id)
}

/** Synchronous, but only non-null once the module has loaded. For callers that can
 *  legitimately render nothing yet (a gallery tile). NEVER correct in a route — it
 *  returns undefined on a cold load, which routes read as "unknown diversion". */
export function peekDiversion(id: string): Diversion | undefined {
  return loaded.get(id)
}

/** Stable promise per id, safe to hand to `use()`. Resolves `undefined` for a slug no
 *  meta.ts claims (a genuine 404); REJECTS if the chunk fetch itself fails, so the
 *  route surfaces an error rather than claiming the piece doesn't exist.
 *
 *  A rejected promise stays CACHED, deliberately. Dropping it on rejection looks like
 *  it would enable a retry, but React indexes tracked thenables positionally and
 *  discards any new promise handed to it on a replay ("A component was suspended by
 *  an uncached promise"). So an evicting cache does not produce a retry — it produces
 *  a fresh `import()` per replay that React then throws away: measured at 5 wasted
 *  imports before the boundary catches, and inside `act()` it does not terminate at
 *  all (57k warnings in 30s). Keeping the rejection surfaces the error in one pass.
 *
 *  The consequence is that a failed chunk is terminal for that id until a reload.
 *  Recovering from it (the long-lived-SPA case where a deploy replaced the hashed
 *  filename under an open tab) needs a remount to get a fresh fiber, i.e. a retry
 *  affordance on the route's boundary — worth doing, but it is a feature, not this
 *  cache's job. */
export function loadDiversion(id: string): Promise<Diversion | undefined> {
  const hit = pending.get(id)
  if (hit) return hit
  const load = loaders.get(id)
  const p = load
    ? load().then((m) => {
        loaded.set(id, m.default)
        return m.default
      })
    : Promise.resolve(undefined)
  pending.set(id, p)
  return p
}

/** The only correct way for a route to get a diversion. Returns synchronously when
 *  warm; otherwise SUSPENDS. Returns undefined only for a slug no meta.ts claims —
 *  never merely because the network is slow.
 *
 *  Suspending (rather than returning null-then-value from an effect) is what keeps
 *  every seam below the call site untouched: the component's first EXECUTED render
 *  already has a non-null diversion, so PlayScreen's `useMemo([diversion])` still runs
 *  resumeConfig / applyFreshLoadRandomization exactly once, in the same order, and
 *  `if (!diversion)` stays unambiguously "404" rather than "maybe still loading". */
export function useDiversion(id: string): Diversion | undefined {
  const hit = loaded.get(id)
  if (hit) return hit
  // Conditional `use()` is explicitly permitted in React 19 — unlike a hook, it may
  // sit after an early return. Note the warm path calls use() ZERO times and the cold
  // path once: React tracks thenables POSITIONALLY, so if a second use() is ever added
  // to a route that also calls this, its index would differ between the two paths.
  // Keep this the only use() on those components, or make the call unconditional.
  if (!loaders.has(id)) return undefined
  return use(loadDiversion(id))
}
