// Map Creator (GH #150) — the reveal/hold/dissolve life-cycle of one map. Pure
// arithmetic over an elapsed-ms accumulator (state owns the accumulator; the
// framework's own `t` isn't reset-able mid-life on a live config edit).

export type Phase = 'reveal' | 'hold' | 'dissolve' | 'done'

export interface Timeline {
  revealDuration: number // ms
  holdDuration: number // ms
  dissolveDuration: number // ms
}

export interface PhaseState {
  phase: Phase
  progress: number // 0..1 — overall reveal fraction (dissolve counts back down)
}

const BASE_REVEAL_MS = 20_000
const HOLD_MS = 11_000
const DISSOLVE_FRACTION = 0.3 // dissolve is quicker than the reveal that built it

/** Reveal duration derived from the `revealSpeed` knob — recomputed every
 *  frame from the live config, so the slider is trivially live-editable. */
export function timelineFor(revealSpeed: number): Timeline {
  const speed = Math.max(0.05, revealSpeed)
  const revealDuration = BASE_REVEAL_MS / speed
  return {
    revealDuration,
    holdDuration: HOLD_MS,
    dissolveDuration: revealDuration * DISSOLVE_FRACTION,
  }
}

/** Given elapsed ms since this map's fields were (re)generated, resolve the
 *  current phase + a 0..1 progress: rises through `reveal`, holds at 1 through
 *  `hold`, falls back to 0 through `dissolve` (reusing the reveal's own
 *  staged draw — a dissolve is just the reveal running in reverse), then
 *  `done` signals the framework to reseed. */
export function phaseAt(elapsed: number, tl: Timeline): PhaseState {
  if (elapsed < tl.revealDuration) {
    return { phase: 'reveal', progress: tl.revealDuration > 0 ? elapsed / tl.revealDuration : 1 }
  }
  const afterReveal = elapsed - tl.revealDuration
  if (afterReveal < tl.holdDuration) {
    return { phase: 'hold', progress: 1 }
  }
  const afterHold = afterReveal - tl.holdDuration
  if (afterHold < tl.dissolveDuration) {
    const frac = tl.dissolveDuration > 0 ? afterHold / tl.dissolveDuration : 1
    return { phase: 'dissolve', progress: 1 - frac }
  }
  return { phase: 'done', progress: 0 }
}
