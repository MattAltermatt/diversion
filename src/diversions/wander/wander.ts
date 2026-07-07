// Pure, canvas-free wander logic: a correlated (momentum) random walk whose
// heading jitters a little each step, so the path meanders in smooth-ish curves.
// Colour cycles slowly along the path via a precomputed 256-entry LUT (per-frame
// palette rebuilds are the #1 jank). All randomness is seeded, so a given seed
// reproduces the same walk exactly. Rendering (canvas strokes, the accumulation
// buffer, compositing) lives in index.ts — this module only computes geometry.
import { mulberry32 } from '../../framework/rng'
import { parseHex6, mix } from '../../framework/color'
import type { WanderConfig } from './schema'

// Phase advanced per step at colorCycleSpeed=1 → a full palette loop every ~50
// steps; at the default 0.15, ~1 loop per 330 steps (a slow, zen gradient river).
const COLOR_K = 0.02
const MAX_STEPS_PER_FRAME = 6000 // anti spiral-of-death clamp (all walkers combined)
const COV_CELL = 12              // coverage grid resolution (px) for the fill trigger
// Accumulate-mode renew fallback: combined steps with zero new coverage before we
// give up on reaching fillThreshold and fade anyway. A healthy walk marks new cells
// constantly; only a degenerate corner (turnLever=0 + bounce → a retracing billiard)
// plateaus below threshold. Step-based (not time) so it's speed-invariant / feel-neutral.
const STALL_STEPS = 3000

export interface Walker {
  x: number          // CSS px
  y: number          // CSS px
  heading: number    // radians
  phase: number      // 0..1 position in the colour LUT
  rng: () => number  // this walker's own seeded stream
}

export interface Segment {
  x0: number; y0: number
  x1: number; y1: number
  color: string      // css rgb(...) sampled from the LUT
}

export type Life = 'draw' | 'fade'

export interface WanderState {
  cfg: WanderConfig
  w: number; h: number
  walkers: Walker[]
  lut: string[]       // 256 css colour strings, cyclic over cfg.colors
  carry: number       // fractional step accumulator (frame-rate independence)
  generation: number  // reseed counter (folds into the seed)
  // Coverage grid — cheap fill estimate for the accumulate lifecycle (no pixel reads).
  cov: Uint8Array
  covCols: number; covRows: number
  covCount: number    // distinct cells marked
  // Lifecycle: 'draw' accumulates; 'fade' hands off to index.ts to fade the buffer out.
  life: Life
  fadeElapsed: number // ms spent fading (accumulate → reseed when >= fadeTime)
  // Coverage-stall fallback: covCount at the last progress frame + steps run since,
  // so a plateau below fillThreshold still renews (see STALL_STEPS).
  prevCovCount: number
  stallSteps: number
}

/** Build a 256-entry cyclic colour LUT from the palette (looped end→start), so
 *  a walker's 0..1 phase maps to a css colour with a single array index. */
export function buildLut(colors: string[]): string[] {
  const rgbs = colors.map(parseHex6)
  const n = rgbs.length
  const N = 256
  const lut = new Array<string>(N)
  for (let i = 0; i < N; i++) {
    const t = (i / N) * n
    const a = Math.floor(t) % n
    const b = (a + 1) % n
    const f = t - Math.floor(t)
    const c = mix(rgbs[a], rgbs[b], f)
    lut[i] = `rgb(${c.r},${c.g},${c.b})`
  }
  return lut
}

function makeCoverage(w: number, h: number) {
  const covCols = Math.max(1, Math.ceil(w / COV_CELL))
  const covRows = Math.max(1, Math.ceil(h / COV_CELL))
  return { cov: new Uint8Array(covCols * covRows), covCols, covRows }
}

function seedWalkers(cfg: WanderConfig, w: number, h: number, generation: number): Walker[] {
  const master = mulberry32((cfg.seed | 0) + generation * 0x9e3779b1)
  const walkers: Walker[] = []
  for (let i = 0; i < cfg.walkers; i++) {
    const x = master() * w
    const y = master() * h
    const heading = master() * Math.PI * 2
    const phase = master()
    const wseed = (Math.floor(master() * 0xffffffff)) >>> 0
    walkers.push({ x, y, heading, phase, rng: mulberry32(wseed) })
  }
  return walkers
}

/** Build a fresh wander state. Pure — no canvas access. */
export function createWanderState(
  cfg: WanderConfig, w: number, h: number, generation = 0,
): WanderState {
  const { cov, covCols, covRows } = makeCoverage(w, h)
  return {
    cfg, w, h,
    walkers: seedWalkers(cfg, w, h, generation),
    lut: buildLut(cfg.colors),
    carry: 0,
    generation,
    cov, covCols, covRows, covCount: 0,
    life: 'draw', fadeElapsed: 0,
    prevCovCount: 0, stallSteps: 0,
  }
}

/** Reseed in place: a new generation of walkers, cleared coverage, back to draw.
 *  (The caller clears the accumulation buffer.) */
export function reseed(s: WanderState): void {
  s.generation += 1
  s.walkers = seedWalkers(s.cfg, s.w, s.h, s.generation)
  s.cov.fill(0)
  s.covCount = 0
  s.life = 'draw'
  s.fadeElapsed = 0
  s.prevCovCount = 0
  s.stallSteps = 0
}

/** Resize without a full reseed: keep the walkers (clamped into the new bounds),
 *  rebuild the coverage grid. The accumulation buffer is wiped by the caller. */
export function resizeWanderState(s: WanderState, w: number, h: number): void {
  s.w = w; s.h = h
  const { cov, covCols, covRows } = makeCoverage(w, h)
  s.cov = cov; s.covCols = covCols; s.covRows = covRows; s.covCount = 0
  for (const wk of s.walkers) {
    wk.x = Math.min(w - 1e-3, Math.max(0, wk.x))
    wk.y = Math.min(h - 1e-3, Math.max(0, wk.y))
  }
}

function markCoverage(s: WanderState, x: number, y: number): void {
  const cx = Math.min(s.covCols - 1, Math.max(0, Math.floor(x / COV_CELL)))
  const cy = Math.min(s.covRows - 1, Math.max(0, Math.floor(y / COV_CELL)))
  const idx = cy * s.covCols + cx
  if (s.cov[idx] === 0) { s.cov[idx] = 1; s.covCount++ }
}

/** Fraction (0..1) of coverage cells visited this generation. */
export function coverageFraction(s: WanderState): number {
  return s.covCount / s.cov.length
}

/** Advance one walker a single step. Returns the drawable segment, or null when
 *  the step wrapped a screen edge (the connecting stroke would smear across the
 *  screen, so we lift the pen for that one step). Mutates the walker. */
export function stepWalker(wk: Walker, cfg: WanderConfig, w: number, h: number, lut: string[]): Segment | null {
  const x0 = wk.x, y0 = wk.y
  // Correlated walk: integrate a small bounded heading jitter → smooth meanders.
  wk.heading += (wk.rng() * 2 - 1) * cfg.turnLever
  let nx = x0 + Math.cos(wk.heading) * cfg.stepSize
  let ny = y0 + Math.sin(wk.heading) * cfg.stepSize
  let wrapped = false
  if (cfg.edges === 'wrap') {
    if (nx < 0) { nx += w; wrapped = true } else if (nx >= w) { nx -= w; wrapped = true }
    if (ny < 0) { ny += h; wrapped = true } else if (ny >= h) { ny -= h; wrapped = true }
  } else {
    // Bounce: reflect the position and the heading off the wall.
    if (nx < 0) { nx = -nx; wk.heading = Math.PI - wk.heading }
    else if (nx > w) { nx = 2 * w - nx; wk.heading = Math.PI - wk.heading }
    if (ny < 0) { ny = -ny; wk.heading = -wk.heading }
    else if (ny > h) { ny = 2 * h - ny; wk.heading = -wk.heading }
  }
  wk.x = nx; wk.y = ny
  wk.phase += cfg.colorCycleSpeed * COLOR_K
  if (wk.phase >= 1) wk.phase -= Math.floor(wk.phase)
  if (wrapped) return null
  const li = Math.min(255, Math.max(0, Math.floor(wk.phase * 256)))
  return { x0, y0, x1: nx, y1: ny, color: lut[li] }
}

/** dt(ms) + speed(steps/s) → whole steps to run this frame, carrying the
 *  fractional remainder so the long-run rate is exact and frame-rate independent. */
export function stepsForDt(s: WanderState, dt: number): number {
  const want = s.carry + (s.cfg.speed * dt) / 1000
  let n = Math.floor(want)
  s.carry = want - n
  const cap = MAX_STEPS_PER_FRAME
  if (n > cap) { n = cap; s.carry = 0 }
  return n < 0 ? 0 : n
}

/** Run this frame's steps for every walker, handing each drawable segment to
 *  `draw`. Marks coverage and, in accumulate mode, flips to 'fade' when the
 *  screen is full enough. No-op while already fading (index.ts drives that). */
export function runSteps(s: WanderState, dt: number, draw: (seg: Segment) => void): void {
  if (s.life !== 'draw' || dt <= 0) return
  const steps = stepsForDt(s, dt)
  const { cfg, w, h, lut } = s
  for (let i = 0; i < steps; i++) {
    for (const wk of s.walkers) {
      const seg = stepWalker(wk, cfg, w, h, lut)
      markCoverage(s, wk.x, wk.y)
      if (seg) draw(seg)
    }
  }
  if (cfg.trailStyle === 'accumulate') {
    // Track progress: a frame that marks a new cell resets the stall counter.
    if (s.covCount > s.prevCovCount) { s.prevCovCount = s.covCount; s.stallSteps = 0 }
    else s.stallSteps += steps
    // Renew when the screen is full enough OR when a degenerate walk has plateaued
    // below threshold (stuck billiard) — otherwise it would never fade + reseed.
    if (coverageFraction(s) >= cfg.fillThreshold / 100 || s.stallSteps >= STALL_STEPS) {
      s.life = 'fade'
      s.fadeElapsed = 0
    }
  }
}
