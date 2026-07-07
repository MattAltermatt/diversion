// tour.ts — an evolving Travelling-Salesman loop solved by local search.
// Pure (no DOM-instantiating imports) so it unit-tests headless. Cities live in a
// fixed unit square [0,1]²; the tour is a permutation of city indices interpreted
// as a closed cycle. Each step tries a budget of random local moves and accepts
// only the ones that SHORTEN the loop (delta computed O(1) from the affected
// endpoints), so the total length is monotonically non-increasing and the tangle
// straightens itself out. When improvements dry up it holds, then rescatters.

import { mulberry32 } from '../../framework/rng'
import type { TourConfig } from './schema'

export type Phase = 'optimizing' | 'holding'

export interface TourState {
  cfg: TourConfig
  w: number
  h: number
  n: number
  cx: Float32Array // city x in [0,1]
  cy: Float32Array // city y in [0,1]
  tour: number[] // permutation of 0..n-1, a closed cycle
  edgeFlash: Float32Array // per tour-position recent-rewire glow (0..1), indexed by position
  rng: () => number
  phase: Phase
  holdTimer: number // ms remaining in the hold phase
  stagnation: number // consecutive optimising frames that accepted no improving move
  length: number // current tour length (unit-square units), maintained incrementally
  startLength: number // length of the freshly-shuffled tour (for progress readouts)
}

// A whole optimising frame that accepts nothing this many times in a row → the
// local search has converged; hold the clean tour, then rescatter. Chosen so a
// near-optimal loop settles in ~1-2s of wall time at typical frame rates.
const CONVERGE_FRAMES = 110
const EPS = 1e-9

const dist = (state: TourState, a: number, b: number): number => {
  const dx = state.cx[a] - state.cx[b]
  const dy = state.cy[a] - state.cy[b]
  return Math.sqrt(dx * dx + dy * dy)
}

/** Total length of the closed cycle, recomputed from scratch. */
export function tourLength(cx: Float32Array, cy: Float32Array, tour: number[]): number {
  const n = tour.length
  let total = 0
  for (let p = 0; p < n; p++) {
    const a = tour[p]
    const b = tour[(p + 1) % n]
    const dx = cx[a] - cx[b]
    const dy = cy[a] - cy[b]
    total += Math.sqrt(dx * dx + dy * dy)
  }
  return total
}

// ── city layouts ─────────────────────────────────────────────────────────────
// Every layout writes into [0,1]²; the renderer maps that to a centred square, so
// distances on screen match the distances the solver optimises (uniform scale).

function scatter(state: TourState): void {
  const { rng, cx, cy, n, cfg } = state
  switch (cfg.cityLayout) {
    case 'clustered': {
      const clusters = Math.max(2, Math.round(Math.sqrt(n) / 2))
      const ccx = new Float32Array(clusters)
      const ccy = new Float32Array(clusters)
      for (let k = 0; k < clusters; k++) {
        ccx[k] = 0.12 + rng() * 0.76
        ccy[k] = 0.12 + rng() * 0.76
      }
      for (let i = 0; i < n; i++) {
        const k = (rng() * clusters) | 0
        // sum of two uniforms ≈ triangular → a soft blob around the centre
        const jx = (rng() + rng() - 1) * 0.11
        const jy = (rng() + rng() - 1) * 0.11
        cx[i] = clamp01(ccx[k] + jx)
        cy[i] = clamp01(ccy[k] + jy)
      }
      break
    }
    case 'ring': {
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2
        const r = 0.34 + (rng() - 0.5) * 0.1
        cx[i] = clamp01(0.5 + Math.cos(a) * r)
        cy[i] = clamp01(0.5 + Math.sin(a) * r)
      }
      break
    }
    case 'grid': {
      const side = Math.max(2, Math.ceil(Math.sqrt(n)))
      const gap = 1 / side
      for (let i = 0; i < n; i++) {
        const gx = i % side
        const gy = (i / side) | 0
        const jx = (rng() - 0.5) * gap * 0.6
        const jy = (rng() - 0.5) * gap * 0.6
        cx[i] = clamp01((gx + 0.5) * gap + jx)
        cy[i] = clamp01((gy + 0.5) * gap + jy)
      }
      break
    }
    default: { // uniform
      for (let i = 0; i < n; i++) {
        cx[i] = 0.04 + rng() * 0.92
        cy[i] = 0.04 + rng() * 0.92
      }
    }
  }
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Fisher–Yates shuffle of 0..n-1 using the seeded stream → a tangled start. */
function shuffledTour(rng: () => number, n: number): number[] {
  const t = new Array<number>(n)
  for (let i = 0; i < n; i++) t[i] = i
  for (let i = n - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    const tmp = t[i]; t[i] = t[j]; t[j] = tmp
  }
  return t
}

/** Lay out fresh cities + a shuffled tour, resetting the run to the optimising
 *  phase. Pulls from the ongoing seeded stream so successive rescatters stay
 *  fully deterministic from the original seed. */
export function rescatter(state: TourState): void {
  scatter(state)
  state.tour = shuffledTour(state.rng, state.n)
  state.length = tourLength(state.cx, state.cy, state.tour)
  state.startLength = state.length
  state.edgeFlash.fill(0)
  state.phase = 'optimizing'
  state.holdTimer = 0
  state.stagnation = 0
}

export function createTourState(cfg: TourConfig, w: number, h: number): TourState {
  const n = cfg.cityCount
  const state: TourState = {
    cfg, w, h, n,
    cx: new Float32Array(n),
    cy: new Float32Array(n),
    tour: [],
    edgeFlash: new Float32Array(n),
    rng: mulberry32(cfg.seed >>> 0),
    phase: 'optimizing',
    holdTimer: 0,
    stagnation: 0,
    length: 0,
    startLength: 0,
  }
  rescatter(state)
  return state
}

// ── moves ────────────────────────────────────────────────────────────────────

/** Change in tour length from a 2-opt move that reverses positions i+1..j
 *  (0<=i<j<=n-1). O(1): only the two swapped edges change. Negative = shorter. */
export function twoOptDelta(state: TourState, i: number, j: number): number {
  const { tour, n } = state
  const a = tour[i]
  const b = tour[i + 1]
  const c = tour[j]
  const d = tour[(j + 1) % n]
  return dist(state, a, c) + dist(state, b, d) - dist(state, a, b) - dist(state, c, d)
}

/** Reverse the tour segment i+1..j in place (the geometric edge-uncross). */
export function applyTwoOpt(tour: number[], i: number, j: number): void {
  let lo = i + 1
  let hi = j
  while (lo < hi) {
    const t = tour[lo]; tour[lo] = tour[hi]; tour[hi] = t
    lo++; hi--
  }
}

/** One 2-opt attempt on random positions. Applies + flashes when it shortens the
 *  loop. Returns the (negative) delta applied, or 0 if nothing was accepted. */
function tryTwoOpt(state: TourState): number {
  const { rng, n, tour } = state
  // pick 0<=i<j<=n-1, excluding the degenerate whole-cycle case (i=0, j=n-1).
  // Both endpoints must range over the full 0..n-1 so that j can reach n-1 —
  // otherwise the wrap edge (n-1→0) and tour positions 0 and n-1 never move.
  let i = (rng() * n) | 0
  let j = (rng() * n) | 0
  if (i === j) return 0
  if (i > j) { const t = i; i = j; j = t }
  if (i === 0 && j === n - 1) return 0
  const delta = twoOptDelta(state, i, j)
  if (delta < -EPS) {
    applyTwoOpt(tour, i, j)
    state.edgeFlash[i] = 1
    state.edgeFlash[j] = 1
    return delta
  }
  return 0
}

/** One Or-opt attempt: lift a run of L (1..3) consecutive cities and reinsert it
 *  elsewhere if that shortens the loop. Non-wrapping run for simple splicing. */
function tryOrOpt(state: TourState): number {
  const { rng, n, tour } = state
  if (n < 6) return 0
  const L = 1 + ((rng() * 3) | 0) // 1..3
  const s = 1 + ((rng() * (n - L - 1)) | 0) // run start, keeps prev + next in range
  const prev = tour[s - 1]
  const segStart = tour[s]
  const segEnd = tour[s + L - 1]
  const next = tour[s + L]
  // insertion edge (P,Q) at position k, k outside [s-1 .. s+L-1]
  let k = (rng() * n) | 0
  if (k >= s - 1 && k <= s + L - 1) return 0
  const P = tour[k]
  const Q = tour[(k + 1) % n]
  if (Q === segStart || P === segEnd) return 0 // adjacent to the run → no-op
  const removed = dist(state, prev, segStart) + dist(state, segEnd, next) + dist(state, P, Q)
  const added = dist(state, prev, next) + dist(state, P, segStart) + dist(state, segEnd, Q)
  const delta = added - removed
  if (delta < -EPS) {
    const seg = tour.splice(s, L) // remove the run
    // k referenced the pre-splice array; find Q's new index and insert after it
    const qi = tour.indexOf(Q)
    tour.splice(qi, 0, ...seg)
    state.edgeFlash[Math.min(qi, n - 1)] = 1
    return delta
  }
  return 0
}

/** Run `budget` local-search attempts. Returns the number of improving moves
 *  accepted this call (0 → a stagnant frame). Length is kept in sync incrementally. */
export function optimizeStep(state: TourState, budget: number): number {
  const mode = state.cfg.optimizer
  let accepted = 0
  for (let m = 0; m < budget; m++) {
    let delta = 0
    if (mode === '2-opt') delta = tryTwoOpt(state)
    else if (mode === 'or-opt') delta = tryOrOpt(state)
    else delta = state.rng() < 0.7 ? tryTwoOpt(state) : tryOrOpt(state)
    if (delta < 0) {
      state.length += delta
      accepted++
    }
  }
  return accepted
}

/** Advance the run by dt ms: optimise (budget scaled to dt), decay edge flashes,
 *  and drive the optimise → hold → rescatter lifecycle. */
export function advance(state: TourState, dt: number): void {
  const dtc = Math.max(1, Math.min(dt, 100))
  // decay the rewire flashes (~180ms half-life)
  const decay = Math.exp(-dtc / 180)
  const ef = state.edgeFlash
  for (let p = 0; p < ef.length; p++) ef[p] *= decay

  if (state.phase === 'optimizing') {
    const budget = Math.max(1, Math.round(state.cfg.movesPerFrame * (dtc / 16.6667)))
    const accepted = optimizeStep(state, budget)
    if (accepted === 0) {
      state.stagnation++
      if (state.stagnation >= CONVERGE_FRAMES) {
        state.phase = 'holding'
        state.holdTimer = state.cfg.holdSeconds * 1000
      }
    } else {
      state.stagnation = 0
    }
  } else {
    state.holdTimer -= dtc
    if (state.holdTimer <= 0) rescatter(state)
  }
}
