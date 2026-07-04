import { mulberry32 } from '../../framework/rng'
import type { LockwardConfig } from './schema'

const TAU = Math.PI * 2
const DEG = Math.PI / 180

/** One blade-ring: an even number of equal angular blades spinning as a rigid disc.
 *  `unit` is the seed-picked speed factor in [-1, 1] and `dir` the counter-rotation
 *  sign — kept separate from the resolved `speed` (rad/s) so a live Spin/Spread edit
 *  recomputes speed without re-seeding (direction + relative rate survive). `phase`
 *  is the live rotation (rad), advanced every frame. */
export interface Ring {
  blades: number // even
  unit: number // seed speed factor in [-1, 1]
  dir: number // +1 / -1 (counter-rotation, alternates by ring)
  speed: number // resolved angular speed, rad/s (signed)
  phase: number // current rotation, rad
}

export interface LockwardState {
  rings: Ring[]
  cfg: LockwardConfig
  w: number
  h: number
  huePhase: number // spectrum colour-wheel drift, degrees
  lutBright: string[] // 360-entry hue→rgb LUT, bright blades
  lutDim: string[] // 360-entry hue→rgb LUT, dim blades (the alternation read)
}

/** Resolve a ring's signed angular speed (rad/s) from its seed factor + live config.
 *  speed = base * (1 + spread*unit) * dir. Kept pure so update() can reapply it. */
function resolveSpeed(cfg: LockwardConfig, unit: number, dir: number): number {
  const mag = cfg.speed * (1 + cfg.speedVariation * unit)
  return mag * DEG * dir
}

/** Pick an even blade count in [min, max] from the stream (min/max coerced even,
 *  ordered, clamped ≥2). Even so the two-ink alternation closes without a seam. */
function pickBlades(rng: () => number, min: number, max: number): number {
  let lo = Math.max(2, Math.round(min / 2) * 2)
  let hi = Math.max(2, Math.round(max / 2) * 2)
  if (hi < lo) { const t = lo; lo = hi; hi = t }
  const steps = (hi - lo) / 2 // number of even values above lo
  return lo + 2 * Math.floor(rng() * (steps + 1))
}

/** Build the ring layout deterministically from the seed. Blade counts, speed
 *  factors and directions are all seed-stable; directions alternate so adjacent
 *  rings counter-rotate (the interlocking churn). Pure. */
export function makeRings(cfg: LockwardConfig): Ring[] {
  const rng = mulberry32(cfg.seed >>> 0)
  const rings: Ring[] = []
  for (let i = 0; i < cfg.ringCount; i++) {
    const blades = pickBlades(rng, cfg.bladesMin, cfg.bladesMax)
    const unit = rng() * 2 - 1 // [-1, 1]
    const dir = i % 2 === 0 ? 1 : -1
    const phase = rng() * TAU // random starting orientation
    rings.push({ blades, unit, dir, speed: resolveSpeed(cfg, unit, dir), phase })
  }
  return rings
}

/** HSL→#rrggbb. Small, only called to bake the LUTs (not per frame). */
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hp < 1) { r = c; g = x } else if (hp < 2) { r = x; g = c }
  else if (hp < 3) { g = c; b = x } else if (hp < 4) { g = x; b = c }
  else if (hp < 5) { r = x; b = c } else { r = c; b = x }
  const m = l - c / 2
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/** Bake a 360-entry hue→hex LUT at a fixed saturation/lightness (the memory-gotcha:
 *  never rebuild a colour wheel per frame). */
function buildHueLUT(sat: number, light: number): string[] {
  const lut: string[] = new Array(360)
  for (let h = 0; h < 360; h++) lut[h] = hslToHex(h, sat, light)
  return lut
}

export function createLockwardState(cfg: LockwardConfig, w: number, h: number): LockwardState {
  return {
    rings: makeRings(cfg),
    cfg,
    w,
    h,
    huePhase: 0,
    lutBright: buildHueLUT(0.85, 0.6),
    lutDim: buildHueLUT(0.8, 0.34),
  }
}

/** Advance every ring's rotation and the colour-wheel drift by dt ms. */
export function stepLockward(state: LockwardState, dt: number): void {
  const dts = dt / 1000
  for (const r of state.rings) r.phase = (r.phase + r.speed * dts) % TAU
  if (state.cfg.color.mode === 'spectrum') {
    state.huePhase = (state.huePhase + state.cfg.color.colorCycle * dts) % 360
  }
}

/** Draw one annular sector (a blade): outer arc CCW, inner arc back. Uses only
 *  ctx.arc — no Path2D (jsdom lacks it, per the smoke-sweep gotcha). */
function drawBlade(
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

/** Colour of blade j in ring i for the current mode/phase. Spectrum sweeps the
 *  wheel around each ring (bright/dim alternation keeps the blade edges legible);
 *  duotone alternates the two inks. */
function bladeColor(state: LockwardState, i: number, j: number): string {
  const cfg = state.cfg
  if (cfg.color.mode === 'duotone') {
    return j % 2 === 0 ? cfg.color.colorA : cfg.color.colorB
  }
  const hue = Math.round(state.huePhase + i * 40 + j * 18) % 360
  const idx = ((hue % 360) + 360) % 360
  return (j % 2 === 0 ? state.lutBright : state.lutDim)[idx]
}

/** Draw one frame fresh: background, an optional additive glow bloom, then the
 *  opaque blade cores on top. Rings rotate, so the whole disc is repainted each
 *  frame (no accumulation buffer). Draws in CSS pixels; caller sets the DPR
 *  transform. */
export function drawLockward(state: LockwardState, ctx: CanvasRenderingContext2D): void {
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
  const span = (R - hub) / cfg.ringCount
  const glowPx = cfg.glow * 9
  const glowAlpha = cfg.glow * 0.5

  // Glow pass — expanded blades, additive, low alpha (opaque cores land on top so
  // the bloom only shows at the margins / in the ring gaps). Two-layer opaque-core
  // + low-alpha-halo, per the additive-blowout gotcha.
  if (cfg.glow > 0) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = glowAlpha
    for (let i = 0; i < state.rings.length; i++) {
      const ring = state.rings[i]
      const rIn = Math.max(0, hub + i * span + cfg.gap / 2 - glowPx)
      const rOut = hub + (i + 1) * span - cfg.gap / 2 + glowPx
      if (rOut <= rIn) continue
      const bw = TAU / ring.blades
      for (let j = 0; j < ring.blades; j++) {
        const a0 = ring.phase + j * bw
        drawBlade(ctx, cx, cy, rIn, rOut, a0, a0 + bw, bladeColor(state, i, j))
      }
    }
  }

  // Opaque core pass.
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  for (let i = 0; i < state.rings.length; i++) {
    const ring = state.rings[i]
    const rIn = hub + i * span + cfg.gap / 2
    const rOut = hub + (i + 1) * span - cfg.gap / 2
    if (rOut <= rIn) continue
    const bw = TAU / ring.blades
    for (let j = 0; j < ring.blades; j++) {
      const a0 = ring.phase + j * bw
      drawBlade(ctx, cx, cy, rIn, rOut, a0, a0 + bw, bladeColor(state, i, j))
    }
  }

  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

/** Live-apply a config change. Layout-defining edits (ring count, blade range,
 *  seed) rebuild the rings → return false so the framework re-runs setup. Speed /
 *  spread edits recompute each ring's speed from its seed-stable factor without
 *  disturbing phase; look/colour edits apply directly. */
export function updateLockward(
  state: LockwardState, cfg: LockwardConfig, w: number, h: number,
): boolean {
  if (
    cfg.ringCount !== state.cfg.ringCount
    || cfg.bladesMin !== state.cfg.bladesMin
    || cfg.bladesMax !== state.cfg.bladesMax
    || cfg.seed !== state.cfg.seed
  ) return false
  if (cfg.speed !== state.cfg.speed || cfg.speedVariation !== state.cfg.speedVariation) {
    for (const r of state.rings) r.speed = resolveSpeed(cfg, r.unit, r.dir)
  }
  state.cfg = cfg
  state.w = w
  state.h = h
  return true
}
