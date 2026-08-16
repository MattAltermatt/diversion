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
 *  meta.ts claims (a genuine 404); REJECTS if the chunk fetch itself fails, so an
 *  error boundary can offer a retry rather than the route claiming the piece
 *  doesn't exist. */
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
  // Drop a REJECTED promise from the cache so a retry re-imports instead of replaying
  // the same failure forever. Without this, memoizing defeats DiversionErrorBoundary:
  // its retry remounts, calls back in, and is handed the identical rejected promise.
  // A chunk fetch failing is not hypothetical — it is the classic long-lived-SPA case
  // where a deploy has replaced the hashed filename under an open tab.
  p.catch(() => {
    if (pending.get(id) === p) pending.delete(id)
  })
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
  // sit after an early return.
  if (!loaders.has(id)) return undefined
  return use(loadDiversion(id))
}
