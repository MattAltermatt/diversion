// Substrate — clean-room reimplementation of the algorithm from Jared
// Tarbell's "Substrate" (complexification.net). Not a code port; the algorithm
// was reproduced from its published description. Original © Jared Tarbell.

import { mulberry32 } from '../../framework/rng'
import { parseHex8, parseHex6, type RGBA } from '../../framework/color'
import { sampleGradientRGBA } from '../../framework/gradient'

// PRNG, colour parsing + gradient sampling now live in the framework; re-exported
// so existing substrate imports (and its tests) keep resolving them from here.
export { mulberry32, parseHex8, parseHex6, sampleGradientRGBA }
export type { RGBA }

// ── Faithfulness constants (hardcoded, not knobs) ───────────────────────────
export const STEP = 0.42          // px a crack advances per step
export const SAND_MAXG = 0.22     // sand-painter gain clamp ±
export const ANGLE_TOL = 5        // degrees; ≤ this from a cell's angle = same line, continue
export const MIN_RAY = 3          // px; mean ray length below this = saturated
export const WARMUP_MS = 2000     // saturation can't trigger before this into a cycle
export const RAY_DECAY = 0.005    // ray-length EMA weight per sample
export const MAX_STEPS = 12       // per-frame advance cap (safety)
export const FUZZ = 0.33          // crack-head positional fuzz
export const EMPTY = -1           // occupancy-grid sentinel

/** Per-crack RNG seed offset. */
export function seedFor(seed: number, i: number): number {
  return (seed + i * 0x9e3779b1) >>> 0
}

/** tpoint: move pixel (x,y) a fraction `a` toward colour `c`, set opaque. OOB = no-op. */
export function blendPixel(
  buf: Uint8ClampedArray, w: number, h: number,
  x: number, y: number, c: RGBA, a: number,
): void {
  if (x < 0 || x >= w || y < 0 || y >= h) return
  const idx = (y * w + x) * 4
  buf[idx]     += (c.r - buf[idx]) * a
  buf[idx + 1] += (c.g - buf[idx + 1]) * a
  buf[idx + 2] += (c.b - buf[idx + 2]) * a
  buf[idx + 3] = 255
}

/** Per-grain alpha: `opacity` at i=0, feathering to ~0 at i=grains. */
export function grainAlpha(i: number, grains: number, opacity: number): number {
  return opacity * (1 - i / grains)
}

/** Radians -> quantized degrees 0..359. */
export function quantizeAngle(rad: number): number {
  let deg = Math.round((rad * 180) / Math.PI) % 360
  if (deg < 0) deg += 360
  return deg
}

/** Smallest absolute angular difference (degrees) between two 0..359 headings. */
export function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 360
  if (d > 180) d = 360 - d
  return d
}

/** A fresh w·h occupancy grid, all cells EMPTY. */
export function makeGrid(w: number, h: number): Int16Array {
  const g = new Int16Array(Math.max(1, w) * Math.max(1, h))
  g.fill(EMPTY)
  return g
}

/** Write `deg` into cell `idx`. Returns true iff it was EMPTY before (a first mark). */
export function markCell(grid: Int16Array, idx: number, deg: number): boolean {
  const fresh = grid[idx] === EMPTY
  grid[idx] = deg
  return fresh
}

/** Does grid value `cell` STOP a crack heading at `deg`?
 *  No if empty or within ANGLE_TOL of `deg` (own line / parallel); yes otherwise. */
export function blocks(cell: number, deg: number): boolean {
  if (cell === EMPTY) return false
  return angleDiff(cell, deg) > ANGLE_TOL
}

import type { SubstrateConfig } from './schema'
import type { Size } from '../../framework/types'

export interface Crack {
  x: number; y: number      // float head position (CSS px)
  angle: number             // heading, radians
  gain: number              // sand-painter gain, random-walks in ±SAND_MAXG
  curvature: number         // heading rotation per step (rad); 0 = straight
  color: RGBA               // wash colour for this crack's current life
  alive: boolean
  rng: () => number         // this crack's own seeded stream
}

export interface SubstrateState {
  cfg: SubstrateConfig
  buf: Uint8ClampedArray<ArrayBuffer> // RGBA, w·h·4, CSS px — never cleared during growth
  grid: Int16Array                    // w·h occupancy (quantized angle | EMPTY)
  cracks: Crack[]
  marked: number[]                     // grid indices of inked cells — the only places a relocating crack may spawn
  palette: RGBA[]
  crackC: RGBA                         // crack ink colour
  bg: RGBA                             // background colour
  w: number; h: number
  phase: 'growing' | 'fading'
  elapsed: number                     // ms grown this cycle
  fadeElapsed: number                 // ms into the current fade
  rayAvg: number                      // EMA of regionFill ray lengths (saturation signal)
  stepAcc: number                     // fractional-step accumulator (speed → integer steps)
  cycle: number                       // cycle index; varies the per-cycle seed
}

/** Fill an RGBA buffer with an opaque colour. */
function fillRGBA(buf: Uint8ClampedArray, c: RGBA): void {
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = c.r; buf[i + 1] = c.g; buf[i + 2] = c.b; buf[i + 3] = 255
  }
}

/** A crack's wash colour: palette pick, or gradient sample by start position. */
export function pickColor(
  cfg: SubstrateConfig, palette: RGBA[], x: number, y: number, w: number, h: number, rng: () => number,
): RGBA {
  if (cfg.color.mode === 'gradient') {
    const t = cfg.color.source === 'y' ? (h > 0 ? y / h : 0) : (w > 0 ? x / w : 0)
    return sampleGradientRGBA(cfg.color.stops, t)
  }
  return palette[Math.floor(rng() * palette.length)] ?? palette[0]
}

/** Per-cycle seed so each cycle is a fresh network, reproducible from cfg.seed. */
function cycleSeed(seed: number, cycle: number): number {
  return (seed + cycle * 0x85ebca6b) >>> 0
}

/** Per-crack curvature (rad/step) from its own RNG: 0 for a straight crack
 *  (probability straightPct/100), else ±STEP/radius with radius uniform across
 *  the [minRadius,maxRadius] band (order-insensitive) and a random direction. */
export function rollCurvature(cfg: SubstrateConfig, rng: () => number): number {
  if (rng() < cfg.straightPct / 100) return 0
  const lo = Math.min(cfg.minRadius, cfg.maxRadius)
  const hi = Math.max(cfg.minRadius, cfg.maxRadius)
  const radius = lo + rng() * (hi - lo)
  const dir = rng() < 0.5 ? 1 : -1
  return (dir * STEP) / Math.max(1, radius)
}

/** Seed `initialCracks` cracks at random positions/headings for cycle `cycle`. */
function seedCracks(cfg: SubstrateConfig, palette: RGBA[], w: number, h: number, cycle: number): Crack[] {
  const base = cycleSeed(cfg.seed, cycle)
  return Array.from({ length: cfg.initialCracks }, (_, i) => {
    const rng = mulberry32(seedFor(base, i))
    const x = rng() * w
    const y = rng() * h
    const angle = rng() * Math.PI * 2
    const gain = 0.01 + rng() * 0.09
    const color = pickColor(cfg, palette, x, y, w, h, rng)
    const curvature = rollCurvature(cfg, rng)
    return { x, y, angle, gain, curvature, color, alive: true, rng }
  })
}

export function createSubstrateState(cfg: SubstrateConfig, w: number, h: number): SubstrateState {
  const W = Math.max(1, w), H = Math.max(1, h)
  const palette = cfg.color.colors.map(parseHex8)
  const bg = parseHex6(cfg.background)
  const buf = new Uint8ClampedArray(W * H * 4)
  fillRGBA(buf, bg)
  return {
    cfg, buf, grid: makeGrid(W, H),
    cracks: seedCracks(cfg, palette, W, H, 0),
    marked: [],
    palette, crackC: parseHex6(cfg.crackColor), bg,
    w: W, h: H,
    phase: 'growing', elapsed: 0, fadeElapsed: 0,
    rayAvg: Math.min(W, H), stepAcc: 0, cycle: 0,
  }
}

/** Advance one crack one STEP: move, fuzz, (sand fill — Task 5), ink, collide. */
export function advanceCrack(state: SubstrateState, cr: Crack): void {
  const { grid, buf, w, h, crackC } = state
  cr.angle += cr.curvature // curve the heading (0 for straight cracks)
  cr.x += STEP * Math.cos(cr.angle)
  cr.y += STEP * Math.sin(cr.angle)
  const fx = cr.x + (cr.rng() * 2 - 1) * FUZZ
  const fy = cr.y + (cr.rng() * 2 - 1) * FUZZ
  const ix = Math.floor(fx), iy = Math.floor(fy)
  if (ix < 0 || ix >= w || iy < 0 || iy >= h) { cr.alive = false; return }
  regionFill(state, cr)
  blendPixel(buf, w, h, ix, iy, crackC, 1) // dark crack ink
  const idx = iy * w + ix
  const deg = quantizeAngle(cr.angle)
  if (blocks(grid[idx], deg)) { cr.alive = false; return }
  if (markCell(grid, idx, deg)) state.marked.push(idx) // track the new inked cell
}

/** Reposition a stopped crack onto a random point on an EXISTING crack — a random
 *  inked cell drawn from `state.marked` — heading ±90° (+ jitter) off that cell's
 *  crack. Fresh gain + colour + curvature; revives the crack. A crack therefore
 *  only ever spawns from an existing crack; the lone random-seed branch is the
 *  degenerate pre-first-ink case (no cell inked yet), which the seed cracks make
 *  unreachable in practice. */
export function findStart(state: SubstrateState, cr: Crack): void {
  const { grid, w, h, cfg, palette, marked } = state
  if (marked.length > 0) {
    const idx = marked[Math.floor(cr.rng() * marked.length)]
    const px = idx % w, py = Math.floor(idx / w)
    const base = (grid[idx] * Math.PI) / 180
    const sign = cr.rng() < 0.5 ? 1 : -1
    const jitter = (cr.rng() * 2 - 1) * (cfg.branchJitter * Math.PI / 180)
    cr.x = px; cr.y = py
    cr.angle = base + sign * (Math.PI / 2) + jitter
  } else {
    cr.x = cr.rng() * w
    cr.y = cr.rng() * h
    cr.angle = cr.rng() * Math.PI * 2
  }
  cr.gain = 0.01 + cr.rng() * 0.09
  cr.color = pickColor(cfg, palette, cr.x, cr.y, w, h, cr.rng)
  cr.curvature = rollCurvature(cfg, cr.rng)
  cr.alive = true
}

/** A brand-new crack with its own RNG stream (keyed by current population), findStart-ed. */
export function makeCrack(state: SubstrateState): Crack {
  const base = cycleSeed(state.cfg.seed, state.cycle)
  const cr: Crack = {
    x: 0, y: 0, angle: 0, gain: 0.05, curvature: 0,
    color: state.palette[0], alive: false,
    rng: mulberry32(seedFor(base, state.cracks.length + 1)),
  }
  findStart(state, cr)
  return cr
}

/** March unit steps from (x,y) along heading `perp` until an inked cell or the
 *  edge; return the number of steps (capped at min(w,h)). */
export function rayLength(state: SubstrateState, x: number, y: number, perp: number): number {
  const { grid, w, h } = state
  const dx = Math.cos(perp), dy = Math.sin(perp)
  const cap = Math.min(w, h)
  let rx = x, ry = y
  for (let n = 1; n <= cap; n++) {
    rx += dx; ry += dy
    const ix = Math.floor(rx), iy = Math.floor(ry)
    if (ix < 0 || ix >= w || iy < 0 || iy >= h) return n
    if (grid[iy * w + ix] !== EMPTY) return n
  }
  return cap
}

/** Perpendicular watercolour wash: ray-march to the nearest neighbour, then lay
 *  `grainDensity` grains from the head toward that endpoint with the sin(sin)
 *  distribution + feathering alpha. Updates the saturation ray-EMA. */
export function regionFill(state: SubstrateState, cr: Crack): void {
  const { buf, w, h, cfg } = state
  const perp = cr.angle - Math.PI / 2
  const n = rayLength(state, cr.x, cr.y, perp)
  state.rayAvg = state.rayAvg * (1 - RAY_DECAY) + n * RAY_DECAY
  // endpoint of the ray
  const ex = cr.x + Math.cos(perp) * n
  const ey = cr.y + Math.sin(perp) * n
  // sand-gain random-walk, clamped
  cr.gain += (cr.rng() * 2 - 1) * 0.05
  if (cr.gain < -SAND_MAXG) cr.gain = -SAND_MAXG
  if (cr.gain > SAND_MAXG) cr.gain = SAND_MAXG
  const grains = cfg.grainDensity
  const wgt = cr.gain / (grains - 1)
  const c = cr.color
  for (let i = 0; i < grains; i++) {
    const sis = Math.sin(Math.sin(i * wgt))
    const px = cr.x + (ex - cr.x) * sis
    const py = cr.y + (ey - cr.y) * sis
    const a = grainAlpha(i, grains, cfg.grainOpacity) * c.a
    if (a > 0) blendPixel(buf, w, h, Math.round(px), Math.round(py), c, a)
  }
}

/** Lerp the whole buffer toward bg by a fraction that completes exactly at fadeTime. */
function fadeStep(state: SubstrateState, dt: number): void {
  const total = state.cfg.fadeTime * 1000
  const remaining = Math.max(dt, total - (state.fadeElapsed - dt))
  const frac = Math.min(1, dt / remaining)
  const { buf, bg } = state
  for (let i = 0; i < buf.length; i += 4) {
    buf[i]     += (bg.r - buf[i]) * frac
    buf[i + 1] += (bg.g - buf[i + 1]) * frac
    buf[i + 2] += (bg.b - buf[i + 2]) * frac
  }
}

/** Start a fresh cycle: clear buffer + grid, new varied seed, reset lifecycle. */
function reseed(state: SubstrateState): void {
  fillRGBA(state.buf, state.bg)
  state.grid.fill(EMPTY)
  state.marked.length = 0
  state.cycle += 1
  state.cracks = seedCracks(state.cfg, state.palette, state.w, state.h, state.cycle)
  state.phase = 'growing'
  state.elapsed = 0
  state.fadeElapsed = 0
  state.rayAvg = Math.min(state.w, state.h)
  state.stepAcc = 0
}

/** Per-frame driver. */
export function stepSubstrate(state: SubstrateState, dt: number): void {
  if (state.phase === 'fading') {
    state.fadeElapsed += dt
    fadeStep(state, dt)
    if (state.fadeElapsed >= state.cfg.fadeTime * 1000) reseed(state)
    return
  }
  // GROWING
  state.elapsed += dt
  state.stepAcc += (state.cfg.speed * (dt / 1000)) / STEP
  let steps = Math.floor(state.stepAcc)
  state.stepAcc -= steps
  if (steps > MAX_STEPS) steps = MAX_STEPS
  for (let s = 0; s < steps; s++) {
    let spawn = 0
    for (const cr of state.cracks) {
      if (!cr.alive) continue
      advanceCrack(state, cr)
      if (!cr.alive) { findStart(state, cr); spawn++ } // relocate keeps it alive
    }
    while (spawn-- > 0 && state.cracks.length < state.cfg.maxCracks) {
      state.cracks.push(makeCrack(state))
    }
  }
  const saturated = state.elapsed > WARMUP_MS && state.rayAvg < MIN_RAY
  if (state.elapsed >= state.cfg.drawTime * 60000 || saturated) { // drawTime is in MINUTES
    state.phase = 'fading'
    state.fadeElapsed = 0
  }
}

/** Apply a config change live; false for structural changes (→ framework re-setup). */
export function updateSubstrateState(state: SubstrateState, cfg: SubstrateConfig, _size: Size): boolean {
  if (
    cfg.initialCracks !== state.cfg.initialCracks ||
    cfg.maxCracks !== state.cfg.maxCracks ||
    cfg.seed !== state.cfg.seed ||
    cfg.background !== state.cfg.background
  ) return false
  state.cfg = cfg
  state.palette = cfg.color.colors.map(parseHex8)
  state.crackC = parseHex6(cfg.crackColor)
  return true
}

/** Rebuild at a new size, refill background, reseed (accretion resets). */
export function resizeSubstrateState(state: SubstrateState, size: Size): void {
  const fresh = createSubstrateState(state.cfg, Math.max(1, size.width), Math.max(1, size.height))
  state.buf = fresh.buf
  state.grid = fresh.grid
  state.cracks = fresh.cracks
  state.marked = fresh.marked
  state.palette = fresh.palette
  state.crackC = fresh.crackC
  state.bg = fresh.bg
  state.w = fresh.w
  state.h = fresh.h
  state.phase = 'growing'
  state.elapsed = 0
  state.fadeElapsed = 0
  state.rayAvg = fresh.rayAvg
  state.stepAcc = 0
  state.cycle = 0
}
