import { mulberry32 } from '../../framework/rng'
import { sampleGradientRGBA } from '../../framework/gradient'
import type { ReiterSnowflakeConfig } from './schema'

// Crystal values run background(≈humidity) < 1 ≤ frozen. Map frozen values across
// the ramp up to this ceiling; the display LUT is 256 entries over [0, VMAX].
const VMAX = 3

type RGB = [number, number, number]

export type SnowState = {
  cfg: ReiterSnowflakeConfig
  w: number
  h: number
  N: number
  cell: number // display cell size, CSS px
  s: Float32Array
  sNew: Float32Array
  v: Float32Array
  recep: Uint8Array
  alpha: number
  beta: number
  gamma: number
  lut: Uint8ClampedArray // 256 × RGBA over value [0, VMAX]
  bg: RGB
  off: HTMLCanvasElement
  offCtx: CanvasRenderingContext2D
  img: ImageData
  stepAcc: number
  phase: 'grow' | 'hold'
  holdTimer: number
  filled: boolean
  reseeds: number
  needBlit: boolean
}

function toRGB(hex8: string[], t: number): RGB {
  const c = sampleGradientRGBA(hex8, t)
  return [Math.round(c.r), Math.round(c.g), Math.round(c.b)]
}

export function buildLUT(stops: string[]): { lut: Uint8ClampedArray; bg: RGB } {
  const s8 = stops.map((s) => (s.length === 7 ? s + 'ff' : s))
  const bg = toRGB(s8, 0)
  const lut = new Uint8ClampedArray(256 * 4)
  for (let i = 0; i < 256; i++) {
    const val = (i / 255) * VMAX
    let c: RGB
    if (val < 1) c = bg // vapor / background is invisible
    else {
      const t = Math.min((val - 1) / 2, 1)
      c = toRGB(s8, 0.42 + 0.58 * t) // frozen edge → solid core
    }
    lut[i * 4] = c[0]; lut[i * 4 + 1] = c[1]; lut[i * 4 + 2] = c[2]; lut[i * 4 + 3] = 255
  }
  return { lut, bg }
}

/** Effective (seed-jittered) growth parameters, kept in their viable bands so
 *  every crystal is different yet still forms. */
export function effectiveParams(cfg: ReiterSnowflakeConfig, jseed: number): { alpha: number; beta: number; gamma: number } {
  const rng = mulberry32(jseed)
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
  const alpha = clamp(cfg.spread + (rng() - 0.5) * 0.24, 0.6, 2.4)
  const beta = clamp(cfg.humidity + (rng() - 0.5) * 0.1, 0.3, 0.9)
  const gamma = clamp(cfg.sharpness * (0.6 + rng() * 1.0), 0.0002, 0.01)
  return { alpha, beta, gamma }
}

function seedCrystal(st: SnowState): void {
  const p = effectiveParams(st.cfg, st.cfg.seed + st.reseeds)
  st.alpha = p.alpha; st.beta = p.beta; st.gamma = p.gamma
  st.s.fill(p.beta)
  const c = ((st.N - 1) >> 1)
  st.s[c * st.N + c] = 1 // a single frozen cell at the centre
  st.phase = 'grow'
  st.holdTimer = 0
  st.filled = false
  st.needBlit = true
}

export function createSnowState(cfg: ReiterSnowflakeConfig, w: number, h: number): SnowState {
  const N = cfg.detail
  const off = document.createElement('canvas')
  off.width = N; off.height = N
  const offCtx = off.getContext('2d')
  if (!offCtx) throw new Error('Reiter Snowflake requires a 2D context for its offscreen buffer')
  const { lut, bg } = buildLUT(cfg.stops)
  const st: SnowState = {
    cfg, w, h, N, cell: displayCell(N, w, h),
    s: new Float32Array(N * N), sNew: new Float32Array(N * N), v: new Float32Array(N * N),
    recep: new Uint8Array(N * N),
    alpha: 1, beta: 0.5, gamma: 0.001, lut, bg,
    off, offCtx, img: offCtx.createImageData(N, N),
    stepAcc: 0, phase: 'grow', holdTimer: 0, filled: false, reseeds: 0, needBlit: true,
  }
  seedCrystal(st)
  return st
}

/** Display cell size (CSS px) so the sheared grid roughly fills the screen. */
export function displayCell(N: number, w: number, h: number): number {
  // sheared grid spans ~1.5·N wide, ~0.87·N tall; size to cover the larger need.
  return Math.max(w / (N * 1.42), h / (N * 0.82))
}

/** Fill the 4 grid borders with `val` (the fixed background vapor reservoir). */
function fillBorder(arr: Float32Array | Uint8Array, N: number, val: number): void {
  const last = N - 1
  for (let q = 0; q < N; q++) { arr[q] = val; arr[last * N + q] = val }
  for (let r = 0; r < N; r++) { arr[r * N] = val; arr[r * N + last] = val }
}

/** One Reiter growth step: split into frozen(u) + vapor(v), add + diffuse. The 6
 *  axial neighbours are read by explicit index arithmetic (i±1, i±N, i+1−N, i−1+N)
 *  over the interior; the 1-cell border is a fixed beta reservoir (the crystal
 *  resets before reaching it), so the interior loop needs no bounds check. */
export function stepSnow(st: SnowState): void {
  const { s, sNew, v, recep, N, alpha, beta, gamma } = st
  const last = N - 1
  const ha = alpha * 0.5
  fillBorder(v, N, beta) // border vapor = reservoir, so interior reads land on beta

  // pass 1 — receptivity + vapor split (interior)
  for (let r = 1; r < last; r++) {
    const base = r * N
    for (let q = 1; q < last; q++) {
      const i = base + q
      let rec = s[i] >= 1 ? 1 : 0
      if (rec === 0 && (s[i + 1] >= 1 || s[i - 1] >= 1 || s[i + N] >= 1 || s[i - N] >= 1
          || s[i + 1 - N] >= 1 || s[i - 1 + N] >= 1)) rec = 1
      recep[i] = rec
      v[i] = rec ? 0 : s[i]
    }
  }

  // pass 2 — add vapor to receptive cells, diffuse the rest
  for (let r = 1; r < last; r++) {
    const base = r * N
    for (let q = 1; q < last; q++) {
      const i = base + q
      const vbar = (v[i + 1] + v[i - 1] + v[i + N] + v[i - N] + v[i + 1 - N] + v[i - 1 + N]) / 6
      const vnew = v[i] + ha * (vbar - v[i])
      sNew[i] = (recep[i] ? s[i] + gamma : 0) + vnew
    }
  }
  fillBorder(sNew, N, beta)

  st.s = sNew
  st.sNew = s
  st.needBlit = true
  if (innerRingFrozen(st)) st.filled = true
}

/** True once the crystal reaches the ring just inside the border reservoir. */
function innerRingFrozen(st: SnowState): boolean {
  const { s, N } = st
  const last = N - 1
  for (let k = 1; k < last; k++) {
    if (s[N + k] >= 1 || s[(last - 1) * N + k] >= 1 || s[k * N + 1] >= 1 || s[k * N + last - 1] >= 1) {
      return true
    }
  }
  return false
}

/** Drive the grow → hold → melt → regrow lifecycle by dt (ms). */
export function tickLifecycle(st: SnowState, dt: number): void {
  if (st.phase === 'grow') {
    if (st.filled) { st.phase = 'hold'; st.holdTimer = 0 }
  } else {
    st.holdTimer += dt
    if (st.holdTimer >= st.cfg.hold * 1000) { st.reseeds++; seedCrystal(st) }
  }
}

export function applyColors(st: SnowState, stops: string[]): void {
  const { lut, bg } = buildLUT(stops)
  st.lut = lut; st.bg = bg; st.needBlit = true
}

/** Paint the crystal into the offscreen buffer, then blit it through a hex-shear
 *  transform so the axial grid displays as a true hexagonal lattice. */
export function renderSnow(st: SnowState, ctx: CanvasRenderingContext2D): void {
  const { img, s, lut, N } = st
  const data = img.data
  for (let i = 0; i < N * N; i++) {
    let idx = (s[i] / VMAX) * 255
    if (idx < 0) idx = 0; else if (idx > 255) idx = 255
    const d = (idx | 0) * 4
    const o = i * 4
    data[o] = lut[d]; data[o + 1] = lut[d + 1]; data[o + 2] = lut[d + 2]; data[o + 3] = 255
  }
  st.offCtx.putImageData(img, 0, 0)

  const cell = st.cell
  const SQ3H = Math.sqrt(3) / 2
  const eX = st.w / 2 - cell * (N / 2) - 0.5 * cell * (N / 2)
  const eY = st.h / 2 - SQ3H * cell * (N / 2)
  ctx.fillStyle = `rgb(${st.bg[0]},${st.bg[1]},${st.bg[2]})`
  ctx.fillRect(0, 0, st.w, st.h)
  ctx.save()
  ctx.transform(cell, 0, 0.5 * cell, SQ3H * cell, eX, eY) // compose hex shear onto DPR
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(st.off, 0, 0)
  ctx.restore()
  st.needBlit = false
}
