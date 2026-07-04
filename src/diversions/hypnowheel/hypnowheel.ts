import { mulberry32 } from '../../framework/rng'
import type { HypnowheelConfig } from './schema'

const TWO_PI = Math.PI * 2
const DEG = Math.PI / 180
// Slow breathing of the spiral tightness — one full swell/relax over this period.
const BREATHE_PERIOD_MS = 24000
// Radial samples per wedge edge — enough to keep the spiral boundary smooth even
// at high tightness without exploding the vertex count.
const RADIAL_STEPS = 48

/** One stacked copy of the wheel. `phase0` is its seed-derived starting rotation
 *  (radians); everything else about a layer's angle is derived live from config +
 *  time (layer index × offset/churn), so live edits apply without a rebuild. */
export interface Layer {
  phase0: number
}

export interface HypnowheelState {
  layers: Layer[]
  cfg: HypnowheelConfig
  w: number
  h: number
  t: number // sim clock, ms
}

/** Seed the per-layer starting rotations. Deterministic in `cfg.seed`: the same
 *  seed lays the layers down identically every run (the determinism keystone). */
function makeLayers(cfg: HypnowheelConfig): Layer[] {
  const rng = mulberry32(cfg.seed >>> 0)
  const layers: Layer[] = []
  for (let k = 0; k < cfg.layers; k++) {
    layers.push({ phase0: rng() * TWO_PI })
  }
  return layers
}

export function createHypnowheelState(cfg: HypnowheelConfig, w: number, h: number): HypnowheelState {
  return { layers: makeLayers(cfg), cfg, w, h, t: 0 }
}

/** Advance the clock. The wheel is stateless beyond time — every layer angle is a
 *  pure function of (t, config), so a frame is fully reconstructable. */
export function stepHypnowheel(state: HypnowheelState, dt: number): void {
  state.t += dt
}

/** The live rotation of layer `k` at time `t` (radians): its seed base, plus the
 *  static per-layer offset, plus the shared spin, plus the per-layer churn that
 *  makes the layers drift apart and beat. Pure. */
export function layerRotation(state: HypnowheelState, k: number, t: number): number {
  const { cfg } = state
  const secs = t / 1000
  return state.layers[k].phase0
    + k * cfg.layerOffset * DEG
    + cfg.rotationSpeed * DEG * secs
    + k * cfg.churn * DEG * secs
}

/** The spiral tightness in effect at time `t`, gently breathing around the base
 *  value when `breathe > 0`. Pure. */
export function effectiveTurns(cfg: HypnowheelConfig, t: number): number {
  if (cfg.breathe <= 0) return cfg.spiralTightness
  const s = Math.sin(TWO_PI * t / BREATHE_PERIOD_MS)
  return cfg.spiralTightness * (1 + cfg.breathe * 0.35 * s)
}

/** The leading-edge angles of all M arms of layer `k` at normalized radius
 *  `rNorm` (0 center … 1 rim). By construction the arms are evenly spaced by
 *  2π/M — the M-fold radial-symmetry invariant the headline test asserts. Pure. */
export function armLeadingAngles(state: HypnowheelState, k: number, rNorm: number): number[] {
  const { cfg } = state
  const M = cfg.arms
  const step = TWO_PI / M
  const rot = layerRotation(state, k, state.t)
  const wind = effectiveTurns(cfg, state.t) * TWO_PI * rNorm
  const angles: number[] = []
  for (let a = 0; a < M; a++) angles.push(rot + a * step + wind)
  return angles
}

/** Build the polygon (flat [x,y,x,y,…]) of one spiral wedge: out along the leading
 *  edge, back along the trailing edge (leading + duty·sector). Pure geometry. */
export function wedgePolygon(
  state: HypnowheelState, k: number, arm: number,
  cx: number, cy: number, radius: number,
): number[] {
  const { cfg } = state
  const step = TWO_PI / cfg.arms
  const width = step * cfg.dutyCycle
  const rot = layerRotation(state, k, state.t)
  const turns = effectiveTurns(cfg, state.t)
  const base = rot + arm * step
  const pts: number[] = []
  // Out along the leading edge.
  for (let i = 0; i <= RADIAL_STEPS; i++) {
    const rn = i / RADIAL_STEPS
    const r = rn * radius
    const ang = base + turns * TWO_PI * rn
    pts.push(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r)
  }
  // Back along the trailing edge.
  for (let i = RADIAL_STEPS; i >= 0; i--) {
    const rn = i / RADIAL_STEPS
    const r = rn * radius
    const ang = base + width + turns * TWO_PI * rn
    pts.push(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r)
  }
  return pts
}

/** Rotate a #rrggbb hex's hue by `deg` degrees, returning an rgb() string.
 *  Renderer-local, used for the duotone hue drift. */
export function hueShift(hex: string, deg: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  let h = 0, s = 0
  const d = max - min
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  h = (((h + deg / 360) % 1) + 1) % 1
  const hue2rgb = (p: number, q: number, tt: number) => {
    if (tt < 0) tt += 1; if (tt > 1) tt -= 1
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

function fillWedge(ctx: CanvasRenderingContext2D, pts: number[]): void {
  ctx.beginPath()
  ctx.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
  ctx.closePath()
  ctx.fill()
}

/** Draw one frame: background, then every layer's M spiral wedges composited in the
 *  mode's blend. Duotone uses `difference` so overlapping ink cancels toward the
 *  ground — the crisp XOR moire wheel; spectrum uses additive `lighter` so overlaps
 *  brighten into luminous nodes. Redrawn fresh each frame; the moire is the live
 *  overlap of the offset, differentially-rotating layers. */
export function drawHypnowheel(state: HypnowheelState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h } = state
  const dpr = ctx.canvas.width / w
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = cfg.color.background
  ctx.fillRect(0, 0, w, h)

  const cx = w / 2, cy = h / 2
  const radius = Math.min(w, h) * 0.5 * 0.98

  if (cfg.color.mode === 'duotone') {
    ctx.globalCompositeOperation = 'difference'
    ctx.fillStyle = cfg.color.hueDrift > 0
      ? hueShift(cfg.color.ink, (state.t / 1000) * cfg.color.hueDrift)
      : cfg.color.ink
    for (let k = 0; k < cfg.layers; k++) {
      for (let a = 0; a < cfg.arms; a++) {
        fillWedge(ctx, wedgePolygon(state, k, a, cx, cy, radius))
      }
    }
  } else {
    ctx.globalCompositeOperation = 'lighter'
    const tints = cfg.color.tints
    for (let k = 0; k < cfg.layers; k++) {
      ctx.fillStyle = tints[k % tints.length]
      for (let a = 0; a < cfg.arms; a++) {
        fillWedge(ctx, wedgePolygon(state, k, a, cx, cy, radius))
      }
    }
  }

  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

/** Live-apply a config change. Only a change to layer COUNT or seed rebuilds the
 *  seeded phase0 array (return false → framework re-runs setup); every other field
 *  is read live by the pure angle/geometry functions, so it applies without a
 *  rebuild. */
export function updateHypnowheelState(state: HypnowheelState, cfg: HypnowheelConfig, w: number, h: number): boolean {
  if (cfg.layers !== state.cfg.layers || cfg.seed !== state.cfg.seed) return false
  state.cfg = cfg
  state.w = w
  state.h = h
  return true
}

/** The wheel is centered and scale-relative, so a resize just records the new size
 *  (draw recomputes center + radius from it). */
export function resizeHypnowheelState(state: HypnowheelState, w: number, h: number): void {
  state.w = w
  state.h = h
}
