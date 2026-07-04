import { mulberry32 } from '../../framework/rng'
import type { BinaryRingConfig } from './schema'

const TAU = Math.PI * 2
const DEG = Math.PI / 180

/** One ring: a self-contained binary counter drawn as a band of arc segments.
 *  `rate` (seed-picked) is how fast this ring's counter advances relative to the
 *  global evolve rate — decreasing outward, so the small inner core flickers while
 *  the big outer horizon rings pulse slowly. `offset` seeds the ring's starting
 *  count so rings never march in lock-step. `rotDir`/`rotFactor` drive the
 *  counter-rotation; `rotPhase` is the live rotation (rad). */
export interface Ring {
  rate: number // counter advance multiplier
  offset: number // seeded starting count (0..255)
  rotDir: number // +1 / -1, alternates by ring (counter-rotation)
  rotFactor: number // seeded per-ring spin magnitude
  rotPhase: number // current rotation, rad
}

export interface BinaryRingState {
  rings: Ring[]
  cfg: BinaryRingConfig
  w: number
  h: number
  counter: number // global float "time in counts"; each ring reads floor(counter*rate)
  huePhase: number // spectrum colour-wheel drift, degrees
  hueLUT: string[] // 360-entry hue→#rgb (spectrum)
  warmLUT: string[] // radial warm ramp, core→rim (warm-horizon)
}

/** Build the seeded ring layout. Rates, offsets, spin factors and directions are
 *  all seed-stable; directions alternate so adjacent rings counter-rotate. Depends
 *  only on `rings` + `seed` (NOT `segments`), so a live segment-count edit never
 *  needs a reseed. Pure. */
export function makeRings(cfg: BinaryRingConfig): Ring[] {
  const rng = mulberry32(cfg.seed >>> 0)
  const rings: Ring[] = []
  for (let i = 0; i < cfg.rings; i++) {
    const mult = 0.7 + 0.6 * rng()
    const rate = mult / (1 + i * 0.35) // outer rings count slower (majestic pulse)
    const offset = Math.floor(rng() * 256)
    const rotFactor = 0.6 + 0.8 * rng()
    const rotDir = i % 2 === 0 ? 1 : -1
    const rotPhase = rng() * TAU
    rings.push({ rate, offset, rotDir, rotFactor, rotPhase })
  }
  return rings
}

/** Effective bit-count a ring displays: one bit per segment, capped at 30 so the
 *  32-bit shifts stay well-defined. Beyond the cap the pattern repeats around the
 *  ring (segment j reads bit j mod nbits) — which reads as a pleasing symmetry. */
export function bitCount(segments: number): number {
  return Math.min(segments, 30)
}

/** The integer value ring i is displaying at the current counter. */
export function ringCode(state: BinaryRingState, i: number): number {
  const r = state.rings[i]
  return (Math.floor(state.counter * r.rate) + r.offset) >>> 0
}

/** Is segment `seg` of ring `i` lit? Pure — the headline mechanic, unit-tested.
 *  binary: bit `seg` of `code` is set. gray: same on the Gray-code of `code` (one
 *  bit flips per step). xor: the Sierpinski/XOR gasket `((i + xorPhase) & seg) === 0`,
 *  which slowly rotates as `xorPhase` (= floor(counter)) advances. */
export function segmentLit(
  pattern: BinaryRingConfig['pattern'],
  i: number, seg: number, code: number, xorPhase: number, nbits: number,
): boolean {
  if (pattern === 'xor') return (((i + xorPhase) & seg) === 0)
  const bit = seg % nbits
  if (pattern === 'gray') {
    const g = code ^ (code >>> 1)
    return ((g >>> bit) & 1) === 1
  }
  return ((code >>> bit) & 1) === 1
}

// ---------------------------------------------------------------------------
// Colour helpers (baked into LUTs at setup — never rebuilt per frame).
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}
function toHex2(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
}
function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`
}
function hexToRgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hp < 1) { r = c; g = x } else if (hp < 2) { r = x; g = c }
  else if (hp < 3) { g = c; b = x } else if (hp < 4) { g = x; b = c }
  else if (hp < 5) { r = x; b = c } else { r = c; b = x }
  const m = l - c / 2
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

function buildHueLUT(sat: number, light: number): string[] {
  const lut: string[] = new Array(360)
  for (let h = 0; h < 360; h++) lut[h] = hslToHex(h, sat, light)
  return lut
}

// Warm "rising sun" ramp: white-gold core → gold → orange → red-orange → deep
// maroon rim. Anchors ordered light→dark so interpolation never wanders off-hue
// (the anchor-ramp gotcha). Baked to a 128-entry LUT indexed by radial fraction.
const WARM_ANCHORS = ['#fff3c4', '#ffcf5c', '#ff8a2a', '#ff4d1a', '#8f1420']
function buildWarmLUT(n = 128): string[] {
  const stops = WARM_ANCHORS.map(hexToRgb)
  const lut: string[] = new Array(n)
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * (stops.length - 1)
    const i0 = Math.min(stops.length - 1, Math.floor(t))
    const i1 = Math.min(stops.length - 1, i0 + 1)
    const f = t - i0
    const a = stops[i0], b = stops[i1]
    lut[k] = rgbToHex(
      a[0] + (b[0] - a[0]) * f,
      a[1] + (b[1] - a[1]) * f,
      a[2] + (b[2] - a[2]) * f,
    )
  }
  return lut
}

export function createBinaryRingState(cfg: BinaryRingConfig, w: number, h: number): BinaryRingState {
  return {
    rings: makeRings(cfg),
    cfg,
    w,
    h,
    counter: 0,
    huePhase: 0,
    hueLUT: buildHueLUT(0.85, 0.58),
    warmLUT: buildWarmLUT(),
  }
}

/** Advance the global counter, per-ring rotation, and the colour-wheel drift by
 *  dt ms. Frame-rate independent. */
export function stepBinaryRing(state: BinaryRingState, dt: number): void {
  const dts = dt / 1000
  const cfg = state.cfg
  state.counter += cfg.evolveSpeed * dts
  for (const r of state.rings) {
    r.rotPhase = (r.rotPhase + cfg.rotation * DEG * r.rotDir * r.rotFactor * dts) % TAU
  }
  if (cfg.color.mode === 'spectrum') {
    state.huePhase = (state.huePhase + cfg.color.colorCycle * dts) % 360
  }
}

/** Colour of lit segment (i, j). warm-horizon ramps by ring (core→rim); spectrum
 *  sweeps the wheel; duotone alternates two inks by (ring+segment) parity. */
function litColor(state: BinaryRingState, i: number, j: number, warmIdx: number): string {
  const mode = state.cfg.color.mode
  if (mode === 'duotone') {
    return (i + j) % 2 === 0 ? state.cfg.color.colorA : state.cfg.color.colorB
  }
  if (mode === 'spectrum') {
    const hue = ((Math.round(state.huePhase + i * 26 + j * 14) % 360) + 360) % 360
    return state.hueLUT[hue]
  }
  return state.warmLUT[warmIdx]
}

/** The warm haze / lit-bloom tint for the current mode. */
function glowColor(state: BinaryRingState): string {
  const mode = state.cfg.color.mode
  if (mode === 'duotone') return state.cfg.color.colorA
  if (mode === 'spectrum') return state.hueLUT[((Math.round(state.huePhase) % 360) + 360) % 360]
  return state.warmLUT[Math.floor(state.warmLUT.length * 0.28)]
}

/** Draw one annular sector (a lit segment). Uses only ctx.arc — no Path2D (jsdom
 *  lacks it, per the smoke-sweep gotcha). */
function drawSegment(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  rIn: number, rOut: number, a0: number, a1: number, color: string,
): void {
  ctx.beginPath()
  ctx.arc(cx, cy, rOut, a0, a1)
  ctx.arc(cx, cy, rIn, a1, a0, true)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

/** Draw one frame fresh: background, the warm horizon haze, an additive bloom on
 *  each lit segment, then the opaque segment cores on top (two-layer opaque-core +
 *  low-alpha-halo, per the additive-blowout gotcha). Draws in CSS pixels; sets the
 *  DPR transform from the backing-store ratio. */
export function drawBinaryRing(state: BinaryRingState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h } = state
  const dpr = ctx.canvas.width / w
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = cfg.color.background
  ctx.fillRect(0, 0, w, h)

  const cx = w / 2
  const cy = h / 2
  const R = Math.min(w, h) / 2 * 0.95
  const hub = R * cfg.hubRadius
  const span = (R - hub) / cfg.rings
  const nbits = bitCount(cfg.segments)
  const bw = TAU / cfg.segments
  const xorPhase = Math.floor(state.counter)
  const denom = Math.max(1, cfg.rings - 1)

  // Warm horizon haze — a radial gradient behind the rings (source-over).
  if (cfg.glow > 0) {
    const grad = ctx.createRadialGradient(cx, cy, hub, cx, cy, R * 1.18)
    const gc = glowColor(state)
    grad.addColorStop(0, hexToRgba(gc, 0.55 * cfg.glow))
    grad.addColorStop(0.55, hexToRgba(gc, 0.22 * cfg.glow))
    grad.addColorStop(1, hexToRgba(gc, 0))
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  }

  const glowPx = cfg.glow * 7
  const glowAlpha = cfg.glow * 0.4

  // Additive bloom pass on lit segments (expanded, low alpha).
  if (cfg.glow > 0) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = glowAlpha
    for (let i = 0; i < state.rings.length; i++) {
      const code = ringCode(state, i)
      const warmIdx = Math.round((i / denom) * (state.warmLUT.length - 1))
      const rIn = Math.max(0, hub + i * span + cfg.gap / 2 - glowPx)
      const rOut = hub + (i + 1) * span - cfg.gap / 2 + glowPx
      if (rOut <= rIn) continue
      const phase = state.rings[i].rotPhase
      for (let j = 0; j < cfg.segments; j++) {
        if (!segmentLit(cfg.pattern, i, j, code, xorPhase, nbits)) continue
        const a0 = phase + j * bw
        drawSegment(ctx, cx, cy, rIn, rOut, a0, a0 + bw, litColor(state, i, j, warmIdx))
      }
    }
  }

  // Opaque core pass.
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  for (let i = 0; i < state.rings.length; i++) {
    const code = ringCode(state, i)
    const warmIdx = Math.round((i / denom) * (state.warmLUT.length - 1))
    const rIn = hub + i * span + cfg.gap / 2
    const rOut = hub + (i + 1) * span - cfg.gap / 2
    if (rOut <= rIn) continue
    const phase = state.rings[i].rotPhase
    for (let j = 0; j < cfg.segments; j++) {
      if (!segmentLit(cfg.pattern, i, j, code, xorPhase, nbits)) continue
      const a0 = phase + j * bw
      drawSegment(ctx, cx, cy, rIn, rOut, a0, a0 + bw, litColor(state, i, j, warmIdx))
    }
  }

  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

/** Live-apply a config change. Only the ring COUNT or the seed rebuild the ring
 *  layout (return false → framework re-runs setup). Everything else — segments,
 *  pattern, speeds, glow, colour, geometry — applies directly to the live state. */
export function updateBinaryRing(
  state: BinaryRingState, cfg: BinaryRingConfig, w: number, h: number,
): boolean {
  if (cfg.rings !== state.cfg.rings || cfg.seed !== state.cfg.seed) return false
  state.cfg = cfg
  state.w = w
  state.h = h
  return true
}
