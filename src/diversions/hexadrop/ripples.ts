// ─── Hexadrop ripple simulation ──────────────────────────────────────────────
// Drops land at random hex cells (seeded) and each emits a ring whose front moves
// outward at `rippleSpeed` hex-rings/sec. A cell at cube distance d from the drop
// gets a Gaussian band of brightness centred on the current front radius, fading
// with `decay`. Every cell's state = the SUM of all active ripple contributions,
// so overlapping rings interfere. Pure logic (no DOM) so it stays unit-testable.
import { mulberry32 } from '../../framework/rng'
import { parseHex6, mix, type RGB } from '../../framework/color'
import { sampleGradientRGBA } from '../../framework/gradient'
import { buildGrid, cubeDistance, hexSpacing, hexCornerOffsets, type HexCell } from './hexgrid'
import type { HexadropConfig } from './schema'

const MAX_DT = 250 // ms — background-tab catch-up guard
const MAX_RIPPLES = 80 // hard ceiling on simultaneously-active rings
const AMP_MIN = 0.02 // prune a ripple once its envelope fades below this
const BAND_SIGMAS = 4 // a cell beyond this many widths from the front is skipped
const RIPPLE_GAIN = 1.4 // brightness of a single ring at its peak (pre soft-clamp)
const LUT_SIZE = 256

/** One expanding ring. `q`,`r` are the drop's axial origin; `color` is its own tint
 *  (used only in by-drop mode). `age` accumulates in ms. */
export interface Ripple {
  q: number
  r: number
  age: number
  color: RGB
}

export interface HexadropState {
  cfg: HexadropConfig
  w: number
  h: number
  rng: () => number
  cells: HexCell[]
  cornerOff: number[] // 12 numbers, corner offsets at cfg.hexSize
  ripples: Ripple[]
  spawnAcc: number // ms accumulated toward the next drop
  maxRing: number // largest ring distance that can still touch the screen
  // Per-cell scratch buffers (reused every frame — no per-frame allocation).
  intensity: Float64Array
  accR: Float64Array
  accG: Float64Array
  accB: Float64Array
  accW: Float64Array
  palette: RGB[] // 256-entry LUT (by-phase)
  bg: RGB
}

/** front radius (in hex-rings) of a ripple of the given age. */
export function frontRadius(ageMs: number, rippleSpeed: number): number {
  return rippleSpeed * (ageMs / 1000)
}

/** Envelope amplitude of a ripple at `ageMs` — decays exponentially. */
export function rippleAmplitude(ageMs: number, decay: number): number {
  return Math.exp(-decay * (ageMs / 1000))
}

/** A ripple's contribution to a cell at cube distance `d`: a Gaussian band centred
 *  on the moving front, scaled by the fading envelope. Pure; argmax over d sits at
 *  the front, so it advances outward as the ripple ages. */
export function rippleContribution(d: number, ageMs: number, cfg: HexadropConfig): number {
  const front = frontRadius(ageMs, cfg.rippleSpeed)
  const amp = rippleAmplitude(ageMs, cfg.decay)
  const x = (d - front) / cfg.rippleWidth
  return amp * Math.exp(-0.5 * x * x)
}

/** Sample the palette into a 256-entry LUT (cool→hot ramp for by-phase). */
export function buildPalette(cfg: HexadropConfig): RGB[] {
  const stops = cfg.colors.map((c) => c + 'ff')
  const lut: RGB[] = new Array(LUT_SIZE)
  for (let i = 0; i < LUT_SIZE; i++) {
    const c = sampleGradientRGBA(stops, i / (LUT_SIZE - 1))
    lut[i] = { r: c.r, g: c.g, b: c.b }
  }
  return lut
}

function allocBuffers(state: HexadropState): void {
  const n = state.cells.length
  state.intensity = new Float64Array(n)
  state.accR = new Float64Array(n)
  state.accG = new Float64Array(n)
  state.accB = new Float64Array(n)
  state.accW = new Float64Array(n)
}

function computeMaxRing(state: HexadropState): void {
  // Longest cube distance a ripple can travel and still light a screen cell ≈ the
  // diagonal in centre-spacings, plus a ring of slack. Used to prune spent rings.
  state.maxRing = Math.hypot(state.w, state.h) / hexSpacing(state.cfg.hexSize) + 2
}

export function createState(cfg: HexadropConfig, w: number, h: number): HexadropState {
  const state: HexadropState = {
    cfg,
    w,
    h,
    rng: mulberry32(cfg.seed >>> 0),
    cells: buildGrid(w, h, cfg.hexSize),
    cornerOff: hexCornerOffsets(cfg.hexSize),
    ripples: [],
    spawnAcc: 0,
    maxRing: 0,
    intensity: new Float64Array(0),
    accR: new Float64Array(0),
    accG: new Float64Array(0),
    accB: new Float64Array(0),
    accW: new Float64Array(0),
    palette: buildPalette(cfg),
    bg: parseHex6(cfg.background),
  }
  allocBuffers(state)
  computeMaxRing(state)
  return state
}

/** Choose a drop colour from the palette (one discrete stop) using the seeded stream. */
function dropColor(state: HexadropState): RGB {
  const cols = state.cfg.colors
  const c = parseHex6(cols[Math.floor(state.rng() * cols.length)])
  return { r: c.r, g: c.g, b: c.b }
}

/** Land a drop at a random cell, seeded. */
function spawnDrop(state: HexadropState): void {
  if (state.cells.length === 0) return
  const cell = state.cells[Math.floor(state.rng() * state.cells.length)]
  state.ripples.push({ q: cell.q, r: cell.r, age: 0, color: dropColor(state) })
  if (state.ripples.length > MAX_RIPPLES) state.ripples.shift() // drop the oldest
}

/** Advance the sim by dt ms: age rings, land new drops, prune spent rings, and
 *  recompute the per-cell intensity (+ per-cell colour accumulators in by-drop). */
export function stepRipples(state: HexadropState, dt: number): void {
  const d = Math.min(dt, MAX_DT)
  const { cfg } = state

  // 1. Age existing ripples.
  for (const rp of state.ripples) rp.age += d

  // 2. Land new drops on the seeded schedule.
  state.spawnAcc += d
  const interval = 1000 / cfg.dropRate
  let guard = 0
  while (state.spawnAcc >= interval && guard++ < MAX_RIPPLES) {
    state.spawnAcc -= interval
    spawnDrop(state)
  }

  // 3. Prune spent rings (faded out, or the front has left the screen entirely).
  const frontLimit = state.maxRing + BAND_SIGMAS * cfg.rippleWidth
  state.ripples = state.ripples.filter((rp) => {
    if (rippleAmplitude(rp.age, cfg.decay) < AMP_MIN) return false
    return frontRadius(rp.age, cfg.rippleSpeed) <= frontLimit
  })

  // 4. Accumulate contributions into the per-cell buffers.
  const { intensity, cells } = state
  intensity.fill(0)
  const byDrop = cfg.colorMode === 'by-drop'
  if (byDrop) { state.accR.fill(0); state.accG.fill(0); state.accB.fill(0); state.accW.fill(0) }

  const halfWidthWindow = BAND_SIGMAS * cfg.rippleWidth
  for (const rp of state.ripples) {
    const front = frontRadius(rp.age, cfg.rippleSpeed)
    const amp = rippleAmplitude(rp.age, cfg.decay)
    if (amp < AMP_MIN) continue
    const invW = 1 / cfg.rippleWidth
    const cr = rp.color
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]
      const dist = cubeDistance(cell.q, cell.r, rp.q, rp.r)
      const delta = dist - front
      if (delta < -halfWidthWindow || delta > halfWidthWindow) continue
      const x = delta * invW
      const g = amp * Math.exp(-0.5 * x * x) * RIPPLE_GAIN
      intensity[i] += g
      if (byDrop) {
        state.accR[i] += cr.r * g
        state.accG[i] += cr.g * g
        state.accB[i] += cr.b * g
        state.accW[i] += g
      }
    }
  }
}

/** Resolve a cell's fill colour (0-255 RGB) from the accumulated buffers, given its
 *  soft-clamped intensity `I` in 0..1. Kept out of the render loop's inline noise. */
export function cellColor(state: HexadropState, i: number, I: number): RGB {
  const { cfg, bg } = state
  if (cfg.colorMode === 'by-drop') {
    const wsum = state.accW[i]
    if (wsum <= 0) return bg
    const base = { r: state.accR[i] / wsum, g: state.accG[i] / wsum, b: state.accB[i] / wsum }
    return mix(bg, base, I)
  }
  if (cfg.colorMode === 'single') {
    return mix(bg, state.palette[LUT_SIZE - 1], I)
  }
  // by-phase: hue follows intensity along the palette.
  const base = state.palette[Math.min(LUT_SIZE - 1, Math.floor(I * (LUT_SIZE - 1)))]
  return mix(bg, base, I)
}

/** Live-apply a config edit. Structural changes (lattice size, seed) → full re-setup. */
export function updateState(state: HexadropState, cfg: HexadropConfig): boolean {
  if (cfg.hexSize !== state.cfg.hexSize || cfg.seed !== state.cfg.seed) return false
  state.cfg = cfg
  state.palette = buildPalette(cfg)
  state.bg = parseHex6(cfg.background)
  computeMaxRing(state)
  return true
}

/** Resize: rebuild the lattice to the new viewport but KEEP the live ripples (their
 *  cube origins are lattice-independent) — a resize must not restart the pond. */
export function resizeState(state: HexadropState, w: number, h: number): void {
  state.w = w
  state.h = h
  state.cells = buildGrid(w, h, state.cfg.hexSize)
  allocBuffers(state)
  computeMaxRing(state)
}
