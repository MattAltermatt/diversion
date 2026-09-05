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
export const START_OFFSET = 1     // px a restarted crack begins along its heading (see findStart)
export const EMPTY = -1           // occupancy-grid sentinel
export const SEED_INSET = 3       // px a corner/centre seed starts in along its heading (#323)
export const CORNER_INSET = 0.03  // fraction of the short side a corner origin sits in from the edges
export const BOUNCE_STEPS = 3     // a crack dying this young after a start is a bounce, not a stop (#323)

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
  wait: number              // sim-SECONDS to idle before moving (seed stagger) or, when dead,
                            // before restarting on the network (#323). 0 = go now. Ticked per
                            // step by STEP/speed, so it rides growth's own frame-rate-independent
                            // clock and honours a live speed change (a wait rolled in steps at
                            // speed 200 and run at speed 5 lasted 210 s in review).
  age: number               // steps advanced since this crack's last start
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
  forceBlit: boolean                  // repaint next frame regardless of step count (after
                                      // setup/resize: the canvas backing store was cleared, so
                                      // a run of zero-step frames must not leave it blank)
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

/** Grid orientation snaps a heading to the nearest quarter turn; free leaves it. */
export function snapHeading(angle: number, orientation: SubstrateConfig['orientation']): number {
  if (orientation !== 'grid') return angle
  return Math.round(angle / (Math.PI / 2)) * (Math.PI / 2)
}

/** A fuzzy idle in sim-seconds: `startDelay` × (0.5..1.5). One rng draw, and only
 *  when a delay is set, so the delay-0 draw order is exactly the classic one. */
function fuzzyWait(cfg: SubstrateConfig, rng: () => number): number {
  if (cfg.startDelay <= 0) return 0
  return cfg.startDelay * (0.5 + rng())
}

/** How far in from both edges a corner origin sits (px). */
export function cornerInset(w: number, h: number): number {
  return Math.max(SEED_INSET, CORNER_INSET * Math.min(w, h))
}

/** Where this cycle's seeds begin: a point plus the heading band pointing away
 *  from it into the canvas. Scatter returns null (each seed rolls its own spot). */
function originOf(
  cfg: SubstrateConfig, w: number, h: number, rng: () => number,
): { x: number; y: number; lo: number; hi: number } | null {
  if (cfg.origin === 'centre') return { x: w / 2, y: h / 2, lo: 0, hi: Math.PI * 2 }
  if (cfg.origin === 'corner') {
    const k = Math.floor(rng() * 4) // 0 TL, 1 TR, 2 BR, 3 BL — the inward quadrant starts at k·90°
    // Inset from both edges: a seed running along the edge (heading 0 from top-left,
    // or any grid heading) would sit on row 0 and be fuzzed off-canvas, and every
    // branch off it toward the edge would be a 3 px stub — measured in Chrome as a
    // dense hatched band down both edges. A few % of the short side gives those
    // branches room to read as streets while the origin still reads as the corner.
    const inset = cornerInset(w, h)
    const x = k === 1 || k === 2 ? w - inset : inset
    const y = k >= 2 ? h - inset : inset
    return { x, y, lo: k * (Math.PI / 2), hi: (k + 1) * (Math.PI / 2) }
  }
  return null
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

/** Seed `initialCracks` cracks for cycle `cycle`: scattered at random, or all at
 *  the cycle's origin point (corner / centre) headed into the canvas and inset
 *  SEED_INSET px along their own heading so no two stamp the same first pixel.
 *  Best-effort: with many seeds on that 3 px ring some still meet on step one, and
 *  a killed seed bounces onto the network as a branch, so the origin still reads.
 *  With a start delay the seeds stagger cumulatively — the first goes at once,
 *  each next one a fuzzy delay after the one before. */
function seedCracks(cfg: SubstrateConfig, palette: RGBA[], w: number, h: number, cycle: number): Crack[] {
  const base = cycleSeed(cfg.seed, cycle)
  const origin = originOf(cfg, w, h, mulberry32(seedFor(base, 0xffff))) // outside any crack index
  let wait = 0
  return Array.from({ length: cfg.initialCracks }, (_, i) => {
    const rng = mulberry32(seedFor(base, i))
    let x = rng() * w
    let y = rng() * h
    let angle = rng() * Math.PI * 2
    if (origin) {
      angle = snapHeading(origin.lo + (angle / (Math.PI * 2)) * (origin.hi - origin.lo), cfg.orientation)
      x = origin.x + Math.cos(angle) * SEED_INSET
      y = origin.y + Math.sin(angle) * SEED_INSET
    } else {
      angle = snapHeading(angle, cfg.orientation)
    }
    const gain = 0.01 + rng() * 0.09
    const color = pickColor(cfg, palette, x, y, w, h, rng)
    const curvature = rollCurvature(cfg, rng)
    if (i > 0) wait += fuzzyWait(cfg, rng) // cumulative: one by one
    return { x, y, angle, gain, curvature, color, alive: true, wait, age: 0, rng }
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
    forceBlit: true,
  }
}

/** Advance one crack one STEP: move, fuzz, (sand fill — Task 5), ink, collide. */
export function advanceCrack(state: SubstrateState, cr: Crack): void {
  const { grid, buf, w, h, crackC } = state
  cr.age += 1
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
    cr.angle = snapHeading(base + sign * (Math.PI / 2) + jitter, cfg.orientation)
    // Start one cell along the new heading. Started ON the cell, the first 0.42 px
    // step in a POSITIVE x/y direction floors back into the same cell — whose angle
    // is 90° off — and is blocked, while a negative step leaves it: branches could
    // only go up or left. Invisible under free headings (fuzz and jitter leak a few
    // through); fatal under grid, where a horizontal line's downward branches ALL
    // died and the city stayed pinned to the top edge. The original offsets by 0.61,
    // which under the ±0.33 head fuzz still floors back 45% of the time; a full
    // pixel clears the cell either way.
    cr.x = px + Math.cos(cr.angle) * START_OFFSET
    cr.y = py + Math.sin(cr.angle) * START_OFFSET
  } else {
    cr.x = cr.rng() * w
    cr.y = cr.rng() * h
    cr.angle = snapHeading(cr.rng() * Math.PI * 2, cfg.orientation)
  }
  cr.wait = 0
  cr.age = 0
  cr.gain = 0.01 + cr.rng() * 0.09
  cr.color = pickColor(cfg, palette, cr.x, cr.y, w, h, cr.rng)
  cr.curvature = rollCurvature(cfg, cr.rng)
  cr.alive = true
}

/** A brand-new crack with its own RNG stream (keyed by current population). With
 *  no start delay it is findStart-ed at once (the classic path); with one it joins
 *  dead and idling, and picks its start point when the wait runs out. */
export function makeCrack(state: SubstrateState): Crack {
  const base = cycleSeed(state.cfg.seed, state.cycle)
  const cr: Crack = {
    x: 0, y: 0, angle: 0, gain: 0.05, curvature: 0,
    color: state.palette[0], alive: false, wait: 0, age: 0,
    rng: mulberry32(seedFor(base, state.cracks.length + 1)),
  }
  cr.wait = fuzzyWait(state.cfg, cr.rng)
  if (cr.wait <= 0) findStart(state, cr)
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

/** Per-frame driver. Returns whether the pixel buffer changed this tick (fading
 *  always mutates; growing only when it actually ran ≥1 step) — the renderer skips
 *  the full-canvas blit on unchanged frames (common at calm/low-speed defaults). */
export function stepSubstrate(state: SubstrateState, dt: number): boolean {
  if (state.phase === 'fading') {
    state.fadeElapsed += dt
    fadeStep(state, dt)
    if (state.fadeElapsed >= state.cfg.fadeTime * 1000) reseed(state)
    return true // fadeStep (or reseed's clear) mutated every pixel
  }
  // GROWING
  state.elapsed += dt
  state.stepAcc += (state.cfg.speed * (dt / 1000)) / STEP
  let steps = Math.floor(state.stepAcc)
  if (steps > MAX_STEPS) steps = MAX_STEPS // execution safety cap (post-stall)
  // Subtract only the steps we actually run so the backlog carries forward — growth
  // speed is then frame-rate independent (below the MAX_STEPS×fps throughput ceiling).
  state.stepAcc -= steps
  // …but bound the backlog so a sustained over-ceiling speed can't accrue unpayable debt.
  if (state.stepAcc > MAX_STEPS) state.stepAcc = MAX_STEPS
  for (let s = 0; s < steps; s++) {
    let spawn = 0
    for (const cr of state.cracks) {
      if (cr.wait > 0) {
        cr.wait -= STEP / state.cfg.speed // one step's worth of sim time
        if (cr.wait > 0) continue
        cr.wait = 0
        // Idle over. A waiting SEED is already placed and simply starts moving next
        // step; a stopped crack picks its restart on whatever the network is NOW.
        if (!cr.alive) { findStart(state, cr); spawn++ }
        continue
      }
      if (!cr.alive) continue
      advanceCrack(state, cr)
      if (!cr.alive) {
        // A restart can still die on its first step or two — a "bounce": the 1 px
        // START_OFFSET plus a diagonal first step floors back into the origin cell
        // about a quarter of the time, and a branch can start straight into an inked
        // neighbour. A bounce restarts at once, as on the classic path; only a crack
        // that actually travelled earns the idle, or a delay would be paid per bounce
        // and feel several times longer than the knob says.
        cr.wait = cr.age < BOUNCE_STEPS ? 0 : fuzzyWait(state.cfg, cr.rng)
        if (cr.wait <= 0) { findStart(state, cr); spawn++ } // relocate keeps it alive
      }
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
  return steps > 0 // only inked the buffer if at least one step actually ran
}

/** Apply a config change live; false for structural changes (→ framework re-setup). */
export function updateSubstrateState(state: SubstrateState, cfg: SubstrateConfig, _size: Size): boolean {
  if (
    cfg.initialCracks !== state.cfg.initialCracks ||
    cfg.maxCracks !== state.cfg.maxCracks ||
    cfg.seed !== state.cfg.seed ||
    cfg.background !== state.cfg.background ||
    cfg.origin !== state.cfg.origin ||           // only shapes the seeds — a restart is what
    cfg.orientation !== state.cfg.orientation    // makes the change visible in the preview
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
  state.forceBlit = true // canvas backing store was cleared by the resize → repaint next frame
}
