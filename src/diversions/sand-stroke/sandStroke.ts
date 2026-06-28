// Sand Stroke — clean-room reimplementation of the algorithm from Jared
// Tarbell's "Sand Stroke" (complexification.net). Not a code port; the algorithm
// was reproduced from its published description. Original © Jared Tarbell.

export interface RGBA { r: number; g: number; b: number; a: number }

/** The gain clamp from Tarbell's source — defines the wave's character. */
export const MAX_GAIN = 0.3

/** mulberry32 PRNG — same as flow-field's, kept local so the diversion is self-contained. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** "#rrggbbaa" -> { r, g, b, a in 0..1 }. */
export function parseHex8(hex: string): RGBA {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    a: parseInt(hex.slice(7, 9), 16) / 255,
  }
}

/** Per-grain alpha: spine `opacity` at i=0, feathering to ~1% of spine at the band edge.
 *  Faithful to Tarbell's `0.1 - i/(wd*10+10)` (which feathers 0.1 → ~0.001 only because
 *  its spine is hardcoded 0.1); rewritten multiplicatively as `opacity·(1 - i/(density+1))`
 *  so the same feather shape holds for any `opacity`. At density 200 the last grain is
 *  opacity·(1 - 199/201) ≈ 1% of spine, matching the original. */
export function grainAlpha(i: number, density: number, opacity: number): number {
  return opacity * (1 - i / (density + 1))
}

/** Random-walk the gain by a uniform ±waviness, clamped to ±MAX_GAIN. */
export function stepGain(g: number, waviness: number, rng: () => number): number {
  const next = g + (rng() * 2 - 1) * waviness
  return Math.max(-MAX_GAIN, Math.min(MAX_GAIN, next))
}

/** Tarbell's `tpoint`: move pixel (x,y) a fraction `a` toward colour `c`, set opaque.
 *  Out-of-bounds is a silent no-op. */
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

/** Linear-interpolate RGBA across evenly-spaced `stops` (hex8) at t in [0,1]. */
export function sampleGradientRGBA(stops: string[], t: number): RGBA {
  const tc = Math.min(1, Math.max(0, t))
  const n = stops.length
  if (n === 1) return parseHex8(stops[0])
  const scaled = tc * (n - 1)
  let i = Math.floor(scaled)
  if (i >= n - 1) i = n - 2
  const f = scaled - i
  const a = parseHex8(stops[i])
  const b = parseHex8(stops[i + 1])
  return {
    r: a.r + (b.r - a.r) * f,
    g: a.g + (b.g - a.g) * f,
    b: a.b + (b.b - a.b) * f,
    a: a.a + (b.a - a.a) * f,
  }
}

/** Amplitude scale: gage·sin(MAX_GAIN) == bandHeight·h (band height scales with canvas). */
export function gageFor(bandHeight: number, h: number): number {
  return (bandHeight * h) / Math.sin(MAX_GAIN)
}

// ── State, sweeps & stepping ────────────────────────────────────────────────
import type { SandStrokeConfig } from './schema'
import type { Size } from '../../framework/types'

/** ~seconds for a sweep to cross the canvas at speed=1 → pxPerSec = w·speed / this. */
export const BASE_CROSS_SECONDS = 8

/** Start-time jitter, as a fraction of one crossing. Each sweep waits a random phase up to this
 *  before entering from the left, so they don't launch in lockstep — but small enough that all
 *  sweeps appear within the first several seconds (a full-cycle jitter trickles in too slowly at
 *  low speed). Dial up for a looser, more scattered front; down for a tighter group. */
export const START_JITTER = 0.25

interface Sweep {
  band: number    // this sweep's stratum index (0..strokes-1) — its y stays within this height band
  y: number       // current lane centre; re-jittered within `band` on every respawn
  x: number       // float column position, 0..w
  lastCol: number // last integer column deposited
  gain: number    // sg — random-walking band amplitude in [-MAX_GAIN, MAX_GAIN]
  color: RGBA     // palette pick (palette mode) or lane sample (gradient/y); gradient/x recomputes per column
  rng: () => number // this sweep's OWN seeded stream — see seedFor / createSandState
}

/** A jittered lane within stratum `band` of `strokes` equal height bands. Stratified so lanes
 *  never cluster (one per band) yet still random within the band — used at init and on every
 *  respawn (so a sweep lands in a fresh y each pass without piling up; sweeps respawn in lockstep). */
function laneFor(band: number, strokes: number, h: number, rng: () => number): number {
  return Math.floor(((band + rng()) / strokes) * h)
}

export interface SandState {
  cfg: SandStrokeConfig
  buf: Uint8ClampedArray<ArrayBuffer> // RGBA, w·h·4, CSS pixels — the accreting painting (DOM-free)
  sweeps: Sweep[]
  palette: RGBA[]
  gage: number
  w: number
  h: number
}

/** Per-sweep RNG seed. Each sweep gets its OWN stream so its gain/colour walk is consumed in
 *  column order — independent of how many columns OTHER sweeps deposit per frame (a single shared
 *  stream interleaved across sweeps drifts as rAF dt jitters). Net: same seed at a given frame
 *  cadence → the same painting; across different frame rates the lanes/palette/wave character
 *  reproduce, though exact pixels can drift (the cumulative gain walk is consumed one draw/column). */
function seedFor(seed: number, i: number): number {
  return (seed + i * 0x9e3779b1) >>> 0
}

function fillBackground(buf: Uint8ClampedArray, bgHex: string): void {
  const r = parseInt(bgHex.slice(1, 3), 16)
  const g = parseInt(bgHex.slice(3, 5), 16)
  const b = parseInt(bgHex.slice(5, 7), 16)
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255
  }
}

/** A sweep's freshly-chosen colour: palette pick, or a gradient sample by lane (source y).
 *  Gradient source 'x' varies per column, so this returns a placeholder the stepper
 *  overrides (see depositColumn). */
function pickColor(cfg: SandStrokeConfig, palette: RGBA[], y: number, h: number, rng: () => number): RGBA {
  if (cfg.color.mode === 'gradient') {
    if (cfg.color.source === 'y') return sampleGradientRGBA(cfg.color.stops, h > 0 ? y / h : 0)
    return sampleGradientRGBA(cfg.color.stops, 0)
  }
  return palette[Math.floor(rng() * palette.length)] ?? palette[0]
}

export function createSandState(cfg: SandStrokeConfig, w: number, h: number): SandState {
  const palette = cfg.color.colors.map(parseHex8)
  const buf = new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4)
  fillBackground(buf, cfg.background)
  const gage = gageFor(cfg.bandHeight, h)
  const sweeps: Sweep[] = Array.from({ length: cfg.strokes }, (_, i) => {
    const rng = mulberry32(seedFor(cfg.seed, i)) // this sweep's own contiguous stream
    const y = laneFor(i, cfg.strokes, h, rng) // stratified: one sweep per height band, no clustering
    // Jittered start time: a random negative phase (up to START_JITTER of a crossing) so sweeps
    // don't launch in lockstep. Each still enters from the LEFT edge (x crosses 0), just at its own
    // moment; the offset survives the wrap (respawn subtracts one width), so leading edges stay
    // decorrelated for good — no aligned front.
    const x = -rng() * w * START_JITTER
    const gain = 0.01 + rng() * 0.09 // Tarbell's selfinit: random(0.01, 0.1)
    const color = pickColor(cfg, palette, y, h, rng)
    return { band: i, y, x, lastCol: Math.floor(x), gain, color, rng }
  })
  return { cfg, buf, sweeps, palette, gage, w, h }
}

/** Deposit one full column of grains at integer column `col` for a sweep. */
function depositColumn(state: SandState, sw: Sweep, col: number): void {
  const { cfg, buf, palette, gage, w, h } = state
  const rng = sw.rng // this sweep's own stream → frame-rate independent
  // gain random-walk (once per column, as in the original's per-frame step)
  sw.gain = stepGain(sw.gain, cfg.waviness, rng)
  // near a flat wave, small chance to recolour (palette mode only)
  if (cfg.color.mode === 'palette' && Math.abs(sw.gain) < 0.01 && rng() < cfg.colorDrift / 1000) {
    sw.color = palette[Math.floor(rng() * palette.length)] ?? palette[0]
  }
  // active colour: gradient/x varies per column; otherwise the sweep's stored colour
  const c = cfg.color.mode === 'gradient' && cfg.color.source === 'x'
    ? sampleGradientRGBA(cfg.color.stops, w > 0 ? col / w : 0)
    : sw.color
  const y = sw.y
  // centre grain (Tarbell: alpha 0.07 ≈ 0.7·spine)
  blendPixel(buf, w, h, col, y, c, 0.7 * cfg.opacity * c.a)
  const wd = cfg.density
  const step = sw.gain / wd
  for (let i = 0; i < wd; i++) {
    const off = gage * Math.sin(i * step)
    const a = grainAlpha(i, wd, cfg.opacity) * c.a
    blendPixel(buf, w, h, col, Math.round(y + off), c, a)
    blendPixel(buf, w, h, col, Math.round(y - off), c, a)
  }
}

export function stepSand(state: SandState, dt: number): void {
  const { cfg, w, h, palette } = state
  const pxPerSec = (w * cfg.speed) / BASE_CROSS_SECONDS
  const adv = pxPerSec * (dt / 1000)
  for (const sw of state.sweeps) {
    sw.x += adv
    // respawn when the sweep runs off the right edge: back to the left, fresh lane, colour, gain
    if (sw.x >= w) {
      sw.x -= w
      sw.lastCol = -1
      sw.y = laneFor(sw.band, cfg.strokes, h, sw.rng) // new y each pass (within its band)
      sw.gain = 0.01 + sw.rng() * 0.09
      sw.color = pickColor(cfg, palette, sw.y, h, sw.rng)
    }
    const target = Math.floor(sw.x)
    for (let col = sw.lastCol + 1; col <= target; col++) depositColumn(state, sw, col)
    sw.lastCol = target
  }
}

/** Apply a config change live. Returns false for structural changes (strokes / seed /
 *  background) so the framework re-runs setup; true otherwise. */
export function updateSandState(state: SandState, cfg: SandStrokeConfig, size: Size): boolean {
  if (
    cfg.strokes !== state.cfg.strokes ||
    cfg.seed !== state.cfg.seed ||
    cfg.background !== state.cfg.background
  ) return false
  state.cfg = cfg
  state.palette = cfg.color.colors.map(parseHex8)
  state.gage = gageFor(cfg.bandHeight, size.height)
  return true
}

/** Rebuild the buffer at a new size, refill background, reseed sweeps (accretion resets). */
export function resizeSandState(state: SandState, size: Size): void {
  const fresh = createSandState(state.cfg, Math.max(1, size.width), Math.max(1, size.height))
  state.buf = fresh.buf
  state.sweeps = fresh.sweeps
  state.palette = fresh.palette
  state.gage = fresh.gage
  state.w = fresh.w
  state.h = fresh.h
}
