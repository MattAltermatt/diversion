// A hard cap on how many WebGL/WebGPU diversion hosts may run at once across the
// gallery. Browsers keep only ~16 active WebGL contexts and, when a new one is
// created past that, silently force-lose the OLDEST — which in a 100-tile gallery
// kills tiles that are still on screen (their shader "compiles" against a lost
// context and returns null, or a float-target extension check fails). Capping the
// number of *live* GPU hosts well under 16 means the gallery never creates the
// 17th context, so the browser never evicts, so no tile ever fails to start.
//
// This is a bound on CONCURRENCY, not lifetime: a host takes a slot on mount and
// returns it on unmount (AnimationHost loseContext()s its context on every teardown
// path, so a returned slot is a genuinely-freed context, not one lingering till GC).
// 2D tiles don't count — a 2D canvas has no scarce context to exhaust.
//
// Cap of 6 (not, say, 12) leaves generous headroom below the ~16 ceiling. It has to:
// React StrictMode double-invokes effects in dev, so each mounting host momentarily
// creates TWO contexts (setup → teardown → setup) — 6 slots can transiently touch ~12
// contexts during a scroll burst, still safely under 16. Production (no StrictMode)
// tops out at 6. A normal screen shows only 2–4 GPU tiles at once, so the cap rarely
// even engages — it's a ceiling, not a throttle.
const MAX_LIVE_GPU = 6

let live = 0
const waiters = new Set<() => void>()

/** Claim a GPU slot if one is free. Returns false when the gallery is already at the
 *  cap — the caller shows a placeholder and waits via subscribeGpuSlot(). */
export function acquireGpuSlot(): boolean {
  if (live >= MAX_LIVE_GPU) return false
  live++
  return true
}

/** Return a slot on unmount and wake one waiting tile so it can claim the opening. */
export function releaseGpuSlot(): void {
  if (live > 0) live--
  for (const wake of waiters) {
    wake() // the woken tile re-tries acquire and unsubscribes itself on success
    break
  }
}

/** Register to be woken when a slot frees. Returns an unsubscribe fn. */
export function subscribeGpuSlot(onFree: () => void): () => void {
  waiters.add(onFree)
  return () => waiters.delete(onFree)
}

/** Test-only: reset module state between cases. */
export function _resetGpuBudget(): void {
  live = 0
  waiters.clear()
}
