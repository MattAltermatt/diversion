// restart.ts — pure stall detector for auto-restart. The diversion owns the policy
// (when a world is "dead"); the framework owns the reseed lifecycle. No allocation
// in tickStall; safe to call every frame.
export const MIN_AGE_MS = 20_000  // let a fresh world organize before judging it
export const STILL_MS = 4_000     // sustained stillness before a reseed
export const FROZEN_SPEED2 = 4    // (world-units/sec)^2; mean speed < 2 u/s = stopped

export interface StallState {
  ageMs: number
  stillMs: number
}

export function createStallState(): StallState {
  return { ageMs: 0, stillMs: 0 }
}

/** Mean of vx^2+vy^2 over the first n particles (0 when n<=0). */
export function meanSpeed2(vx: Float32Array, vy: Float32Array, n: number): number {
  if (n <= 0) return 0
  let s = 0
  for (let i = 0; i < n; i++) s += vx[i] * vx[i] + vy[i] * vy[i]
  return s / n
}

/** Advance the stall clock by dtMs at the current mean speed^2. Returns true when
 *  the world has been below FROZEN_SPEED2 for STILL_MS straight, past the min-age. */
export function tickStall(state: StallState, dtMs: number, speed2: number): boolean {
  state.ageMs += dtMs
  if (state.ageMs < MIN_AGE_MS) {
    state.stillMs = 0
    return false
  }
  state.stillMs = speed2 < FROZEN_SPEED2 ? state.stillMs + dtMs : 0
  return state.stillMs >= STILL_MS
}
