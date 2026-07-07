import { mulberry32 } from '../../framework/rng'
import type { SwirlConfig } from './schema'

const TWO_PI = Math.PI * 2
const DEG = Math.PI / 180
// Exponential steepness of the log-spiral radius curve (arms crowd near the centre).
const LOG_K = 2.4
// Colour-ramp resolution. A filament's hue slides along this LUT centre→rim; runs of
// the same LUT index are stroked as one sub-path, so this also bounds sub-paths/arm.
export const LUT_SIZE = 72
// Crossfade window at the tail of each reseed epoch (ms) — the old and new
// arrangements are drawn together, weighted, so a reseed is never a hard cut.
const CROSSFADE_MS = 6000

/** One spiral source: a home position (normalized 0..1), a slow bounded elliptical
 *  orbit it wanders on, its arms' starting rotation, and a base hue. All fields are
 *  seed-derived — the same (seed, epoch) lays every centre down identically. */
export interface CenterSpec {
  homeX: number
  homeY: number
  ampX: number
  ampY: number
  freqX: number
  freqY: number
  phaseX: number
  phaseY: number
  armPhase0: number
  hueBase: number
}

export interface SwirlState {
  cfg: SwirlConfig
  w: number
  h: number
  t: number // sim clock, ms
  lut: string[] // rgb() strings, rebuilt only when colour config changes
  lutKey: string
  centersByEpoch: Map<number, CenterSpec[]>
}

/** Mix a base seed with an epoch index into a fresh 32-bit stream seed. Epoch 0 is
 *  the base arrangement, so a run reproduces exactly at t=0. */
function epochSeed(seed: number, epoch: number): number {
  return ((seed >>> 0) ^ Math.imul(epoch + 1, 0x9e3779b1)) >>> 0
}

/** Seed the spiral sources for a given (config, epoch). Deterministic in
 *  cfg.seed ^ epoch: same inputs → identical centres (the determinism keystone).
 *  Centres are laid on a jittered ring around screen centre so they always overlap
 *  and never clump into a corner. */
export function makeCenters(cfg: SwirlConfig, epoch: number): CenterSpec[] {
  const rng = mulberry32(epochSeed(cfg.seed, epoch))
  const centers: CenterSpec[] = []
  for (let i = 0; i < cfg.centers; i++) {
    const ringR = 0.12 + rng() * 0.14
    const ang = (i / cfg.centers) * TWO_PI + (rng() - 0.5) * 0.9
    centers.push({
      homeX: 0.5 + Math.cos(ang) * ringR,
      homeY: 0.5 + Math.sin(ang) * ringR,
      ampX: 0.03 + rng() * 0.06,
      ampY: 0.03 + rng() * 0.06,
      // Incommensurate slow orbit periods (12–40 s) so the field never repeats.
      freqX: TWO_PI / (12000 + rng() * 28000),
      freqY: TWO_PI / (12000 + rng() * 28000),
      phaseX: rng() * TWO_PI,
      phaseY: rng() * TWO_PI,
      armPhase0: rng() * TWO_PI,
      hueBase: i / cfg.centers + rng() * 0.12,
    })
  }
  return centers
}

/** The live centre of a source at time `t`, in normalized 0..1 coords: its home plus
 *  a `drift`-scaled bounded orbit, then the whole field rotated about screen centre by
 *  `rotSpeed` deg/s. Rotating the POSITIONS (here) alongside the arm angles (armAnglesAt /
 *  spiralArmPoints, which also add rotSpeed) makes "Rotation" a true rigid turn of the
 *  composition — genuinely independent of "Arm spin" (swirlSpeed), which only winds the
 *  arms relative to that field (#271). Pure — a frame is fully reconstructable. */
export function centerXY(spec: CenterSpec, t: number, drift: number, rotSpeed = 0): { x: number; y: number } {
  const x = spec.homeX + drift * spec.ampX * Math.sin(spec.freqX * t + spec.phaseX)
  const y = spec.homeY + drift * spec.ampY * Math.sin(spec.freqY * t + spec.phaseY)
  if (!rotSpeed) return { x, y }
  const a = rotSpeed * DEG * (t / 1000)
  const ca = Math.cos(a), sa = Math.sin(a)
  const ox = x - 0.5, oy = y - 0.5
  return { x: 0.5 + ox * ca - oy * sa, y: 0.5 + ox * sa + oy * ca }
}

/** Normalized radius (0 centre … 1 rim) at arm-parameter `u` (0..1). Monotonically
 *  increasing in `u` for both spiral types — the headline invariant. */
export function rFracAt(type: SwirlConfig['spiralType'], u: number): number {
  if (type === 'archimedean') return u
  return (Math.exp(LOG_K * u) - 1) / (Math.exp(LOG_K) - 1)
}

/** The base angles (radians) of a centre's arms at parameter `u`. All arms share the
 *  same winding `theta(u)`, so they stay evenly spaced by 2π/arms at every radius —
 *  the even-fan invariant. `t` supplies the field rotation + per-source arm spin. */
export function armAnglesAt(spec: CenterSpec, cfg: SwirlConfig, t: number, u: number): number[] {
  const secs = t / 1000
  const M = cfg.armsPerCenter
  const step = TWO_PI / M
  const theta = cfg.spiralTightness * TWO_PI * u
  const base = spec.armPhase0
    + cfg.rotationSpeed * DEG * secs
    + cfg.swirlSpeed * DEG * secs
    + theta
  const out: number[] = []
  for (let a = 0; a < M; a++) out.push(base + a * step)
  return out
}

/** Sample one spiral arm into a flat polyline [x,y,x,y,…] in pixel space. `minDim`
 *  is the smaller screen dimension; reach = spread·minDim. Pure geometry. */
export function spiralArmPoints(
  spec: CenterSpec, cfg: SwirlConfig, armIndex: number, t: number,
  w: number, h: number, minDim: number, samples: number,
): number[] {
  const secs = t / 1000
  const M = cfg.armsPerCenter
  const step = TWO_PI / M
  const reach = cfg.spread * minDim
  const { x: nx, y: ny } = centerXY(spec, t, cfg.drift, cfg.rotationSpeed)
  const cx = nx * w
  const cy = ny * h
  const spin = spec.armPhase0
    + cfg.rotationSpeed * DEG * secs
    + cfg.swirlSpeed * DEG * secs
    + armIndex * step
  const pts: number[] = []
  for (let i = 0; i <= samples; i++) {
    const u = i / samples
    const rf = rFracAt(cfg.spiralType, u)
    const ang = spin + cfg.spiralTightness * TWO_PI * u
    const r = rf * reach
    pts.push(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r)
  }
  return pts
}

function hslToRgb(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, tt: number) => {
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const R = Math.round(hue2rgb(p, q, h + 1 / 3) * 255)
  const G = Math.round(hue2rgb(p, q, h) * 255)
  const B = Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  return `rgb(${R}, ${G}, ${B})`
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

/** Precompute the LUT_SIZE-entry colour ramp. Spectrum: a full jewel hue wheel.
 *  Palette: a CYCLIC interpolation of the config stops (wraps last→first, so hue
 *  cycling scrolls seamlessly). Pure. */
export function buildLUT(cfg: SwirlConfig): string[] {
  const lut: string[] = new Array(LUT_SIZE)
  if (cfg.color.mode === 'spectrum') {
    for (let i = 0; i < LUT_SIZE; i++) lut[i] = hslToRgb(i / LUT_SIZE, 0.82, 0.6)
    return lut
  }
  const stops = cfg.color.palette.map(hexToRgb)
  const n = stops.length
  for (let i = 0; i < LUT_SIZE; i++) {
    const p = (i / LUT_SIZE) * n
    const seg = Math.floor(p)
    const f = p - seg
    const c0 = stops[seg % n]
    const c1 = stops[(seg + 1) % n]
    const r = Math.round(c0[0] + (c1[0] - c0[0]) * f)
    const g = Math.round(c0[1] + (c1[1] - c0[1]) * f)
    const b = Math.round(c0[2] + (c1[2] - c0[2]) * f)
    lut[i] = `rgb(${r}, ${g}, ${b})`
  }
  return lut
}

function lutKeyOf(cfg: SwirlConfig): string {
  return cfg.color.mode === 'spectrum'
    ? 'spectrum'
    : 'palette:' + cfg.color.palette.join(',')
}

function lutIndex(huePhase: number): number {
  const f = ((huePhase % 1) + 1) % 1
  return Math.min(LUT_SIZE - 1, Math.floor(f * LUT_SIZE))
}

export function createSwirlState(cfg: SwirlConfig, w: number, h: number): SwirlState {
  return {
    cfg, w, h, t: 0,
    lut: buildLUT(cfg),
    lutKey: lutKeyOf(cfg),
    centersByEpoch: new Map(),
  }
}

export function stepSwirl(state: SwirlState, dt: number): void {
  state.t += dt
}

/** Memoized centres for an epoch — built once, kept only for the current/next epoch
 *  so the map never grows. */
function centersForEpoch(state: SwirlState, epoch: number): CenterSpec[] {
  let c = state.centersByEpoch.get(epoch)
  if (!c) {
    c = makeCenters(state.cfg, epoch)
    state.centersByEpoch.set(epoch, c)
    for (const k of state.centersByEpoch.keys()) {
      if (k < epoch - 1) state.centersByEpoch.delete(k)
    }
  }
  return c
}

/** Draw every arm of one source, weighted by `weight` (crossfade alpha). Filaments
 *  are stroked as a soft wide halo under a bright thin core, additively ('lighter')
 *  so crossings bloom; alpha fades toward the centre so the convergence point can't
 *  white out. Each arm is split into LUT-index runs for the centre→rim hue slide. */
function drawCenter(
  ctx: CanvasRenderingContext2D, state: SwirlState, spec: CenterSpec, weight: number,
): void {
  const { cfg, w, h, t, lut } = state
  const minDim = Math.min(w, h)
  const secs = t / 1000
  const cycle = cfg.color.colorCycle * secs / 360
  const radial = cfg.color.radialHue / 360
  const samples = Math.max(32, Math.min(140, Math.round(24 * cfg.spiralTightness)))

  const coreAlpha = 0.5 * weight
  const haloAlpha = cfg.glow * 0.35 * weight
  const haloMul = 3 + cfg.glow * 5

  for (let a = 0; a < cfg.armsPerCenter; a++) {
    const pts = spiralArmPoints(spec, cfg, a, t, w, h, minDim, samples)
    // Walk the polyline, breaking into runs that share a LUT index (contiguous
    // because hue is monotonic in radius). Each run is one halo+core sub-stroke.
    let runStart = 0
    let runIdx = lutIndex(spec.hueBase + rFracAt(cfg.spiralType, 0) * radial + cycle)
    const flush = (end: number) => {
      if (end - runStart < 1) return
      const uMid = ((runStart + end) / 2) / samples
      const rf = rFracAt(cfg.spiralType, uMid)
      const fade = Math.min(1, rf * 1.25 + 0.05)
      const color = lut[runIdx]
      ctx.strokeStyle = color
      // Halo.
      if (haloAlpha > 0) {
        ctx.globalAlpha = haloAlpha * fade
        ctx.lineWidth = cfg.lineWidth * haloMul
        ctx.beginPath()
        ctx.moveTo(pts[runStart * 2], pts[runStart * 2 + 1])
        for (let i = runStart + 1; i <= end; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1])
        ctx.stroke()
      }
      // Core.
      ctx.globalAlpha = coreAlpha * fade
      ctx.lineWidth = cfg.lineWidth
      ctx.beginPath()
      ctx.moveTo(pts[runStart * 2], pts[runStart * 2 + 1])
      for (let i = runStart + 1; i <= end; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1])
      ctx.stroke()
    }
    for (let i = 1; i <= samples; i++) {
      const u = i / samples
      const idx = lutIndex(spec.hueBase + rFracAt(cfg.spiralType, u) * radial + cycle)
      if (idx !== runIdx) {
        flush(i) // overlap one sample so runs connect seamlessly
        runStart = i
        runIdx = idx
      }
    }
    flush(samples)
  }
}

/** Draw one frame: dark ground (live, source-over) then the additive spiral field.
 *  During a reseed's crossfade the old and next arrangements are both drawn, weighted
 *  so the swap is smooth. Redrawn fresh each frame (the field rotates + drifts). */
export function drawSwirl(state: SwirlState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h, t } = state
  const dpr = ctx.canvas.width / w
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = cfg.color.background
  ctx.fillRect(0, 0, w, h)

  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const reseedMs = cfg.reseedSeconds * 1000
  if (reseedMs <= 0) {
    for (const spec of centersForEpoch(state, 0)) drawCenter(ctx, state, spec, 1)
  } else {
    const epoch = Math.floor(t / reseedMs)
    const into = t - epoch * reseedMs
    const fadeStart = reseedMs - CROSSFADE_MS
    for (const spec of centersForEpoch(state, epoch)) {
      const wOld = into > fadeStart ? 1 - (into - fadeStart) / CROSSFADE_MS : 1
      drawCenter(ctx, state, spec, wOld)
    }
    if (into > fadeStart) {
      const wNew = (into - fadeStart) / CROSSFADE_MS
      for (const spec of centersForEpoch(state, epoch + 1)) drawCenter(ctx, state, spec, wNew)
    }
  }

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

/** Live-apply a config change. A colour-config change rebuilds the LUT in place; a
 *  seed change invalidates the memoized centres. Everything else is read live by the
 *  pure geometry, so no field forces a full re-setup. */
export function updateSwirlState(state: SwirlState, cfg: SwirlConfig, w: number, h: number): boolean {
  const newKey = lutKeyOf(cfg)
  if (newKey !== state.lutKey) {
    state.lut = buildLUT(cfg)
    state.lutKey = newKey
  }
  if (cfg.seed !== state.cfg.seed || cfg.centers !== state.cfg.centers) {
    state.centersByEpoch.clear()
  }
  state.cfg = cfg
  state.w = w
  state.h = h
  return true
}

/** The field is centre-relative + scale-relative, so a resize just records the new
 *  size (draw recomputes centres + reach from it). */
export function resizeSwirlState(state: SwirlState, w: number, h: number): void {
  state.w = w
  state.h = h
}
