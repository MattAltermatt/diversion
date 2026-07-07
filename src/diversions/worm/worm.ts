import { mulberry32 } from '../../framework/rng'
import { hslToRgb, rgba } from '../../framework/color'
import { trailFadeAlpha } from '../../framework/gradient'
import type { WormConfig } from './schema'

// The sim advances in fixed steps so motion is frame-rate independent AND cleanly
// deterministic from the seed (step count is derived from accumulated time, never
// from the raw frame dt). 16ms ≈ one step per 60fps frame.
export const FIXED_DT = 16

export interface Segment {
  x: number
  y: number
}

export interface Worm {
  segs: Segment[] // segs[0] is the head; the rest trail at fixed spacing
  heading: number // radians; a slow random walk → gentle S-curves
  hue0: number // this worm's base hue (0..360), rolled from the seed
  t: number // this worm's slot 0..1 across the flock (for rainbow mode)
}

export interface WormState {
  worms: Worm[]
  rng: () => number // seeded — heading jitter stays deterministic per seed
  cfg: WormConfig
  w: number
  h: number
  spacing: number // fixed gap between consecutive segments (px)
  acc: number // fixed-step accumulator (ms)
  needsClear: boolean
}

/** Segment gap for a given thickness. Kept a fraction of the thickness so the
 *  overlapping discs always fuse into a smooth body (gap < radius). */
export function segSpacingFor(thickness: number): number {
  return Math.max(2, thickness * 0.55)
}

/** Minimum-image delta on a toroidal axis of length `size` — the shortest signed
 *  distance from `b` to `a`, so a body stays connected across the wrap seam. */
export function wrapDelta(d: number, size: number): number {
  return d - size * Math.round(d / size)
}

function wrap(v: number, size: number): number {
  return ((v % size) + size) % size
}

export function createWormState(cfg: WormConfig, w: number, h: number): WormState {
  const rng = mulberry32(cfg.seed >>> 0)
  const spacing = segSpacingFor(cfg.thickness)
  const worms: Worm[] = []
  for (let i = 0; i < cfg.wormCount; i++) {
    const hx = rng() * w
    const hy = rng() * h
    const heading = rng() * Math.PI * 2
    const hue0 = rng() * 360
    // Lay the body straight out behind the head so a worm reads full-length from
    // frame 0 (segments then relax onto the curving path as the head wriggles).
    const segs: Segment[] = []
    const dx = Math.cos(heading)
    const dy = Math.sin(heading)
    for (let s = 0; s < cfg.bodyLength; s++) {
      segs.push({ x: wrap(hx - dx * spacing * s, w), y: wrap(hy - dy * spacing * s, h) })
    }
    worms.push({ segs, heading, hue0, t: cfg.wormCount === 1 ? 0 : i / (cfg.wormCount - 1) })
  }
  return { worms, rng, cfg, w, h, spacing, acc: 0, needsClear: true }
}

/** Advance every worm exactly one fixed step. Pure w.r.t. the seeded rng, so the
 *  same seed → the same paths. The head turns by at most ±turniness (never a sharp
 *  corner / teleport), then each follower snaps to a fixed gap behind the one
 *  ahead — keeping the chain connected even across the wrap seam. */
export function stepWormsOnce(state: WormState): void {
  const { worms, rng, cfg, w, h, spacing } = state
  const v = (cfg.speed * FIXED_DT) / 1000 // px this step
  for (const worm of worms) {
    // slow random walk in heading → smooth curving path
    worm.heading += (rng() * 2 - 1) * cfg.turniness
    const head = worm.segs[0]
    head.x = wrap(head.x + Math.cos(worm.heading) * v, w)
    head.y = wrap(head.y + Math.sin(worm.heading) * v, h)
    // pull each following segment to a fixed distance behind its predecessor,
    // measured on the torus so a body crossing an edge stays intact
    for (let i = 1; i < worm.segs.length; i++) {
      const ahead = worm.segs[i - 1]
      const seg = worm.segs[i]
      const dx = wrapDelta(ahead.x - seg.x, w)
      const dy = wrapDelta(ahead.y - seg.y, h)
      const d = Math.hypot(dx, dy)
      if (d > 1e-6) {
        seg.x = wrap(ahead.x - (dx / d) * spacing, w)
        seg.y = wrap(ahead.y - (dy / d) * spacing, h)
      }
    }
  }
}

/** Advance the sim by real frame time, drained in fixed steps. */
export function stepWorms(state: WormState, dt: number): void {
  // Clamp the catch-up so a stall (tab refocus) can't spin thousands of steps.
  state.acc = Math.min(state.acc + dt, FIXED_DT * 6)
  while (state.acc >= FIXED_DT) {
    stepWormsOnce(state)
    state.acc -= FIXED_DT
  }
}

/** Live-apply a config change. Structural changes (worm count, body length, seed)
 *  need a fresh setup → return false; everything visual is read live from cfg. */
export function updateWormState(state: WormState, cfg: WormConfig): boolean {
  if (
    cfg.wormCount !== state.cfg.wormCount ||
    cfg.bodyLength !== state.cfg.bodyLength ||
    cfg.seed !== state.cfg.seed
  ) {
    return false
  }
  state.cfg = cfg
  state.spacing = segSpacingFor(cfg.thickness)
  return true
}

/** Base body colour for a segment at fraction `fr` (0 head .. 1 tail). */
export function segColor(worm: Worm, fr: number, cfg: WormConfig, alpha = 1): string {
  let hue: number
  if (cfg.colorMode === 'rainbow') hue = worm.t * 300 // fan by flock slot ONLY — a random hue0 base swamped the spectral read (#271)
  else if (cfg.colorMode === 'shift-along-body') hue = worm.hue0 + fr * cfg.bodyHueShift
  else hue = worm.hue0
  return rgba(hslToRgb(hue, cfg.saturation, cfg.lightness), alpha)
}

/** Draw one frame: composite the background live (a full wipe in clean mode, a
 *  low-alpha wash in trails mode), then paint every worm tail-first so rounded
 *  heads sit on top. Overlapping tapered discs fuse into a smooth glossy body. */
export function drawWorms(state: WormState, ctx: CanvasRenderingContext2D): void {
  const { worms, cfg, w, h } = state
  ctx.globalCompositeOperation = 'source-over'
  if (state.needsClear) {
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, w, h)
    state.needsClear = false
  } else if (cfg.trailMode === 'trails') {
    ctx.fillStyle = `rgba(${bgTriplet(cfg.background)},${trailFadeAlpha(cfg.trailFade)})`
    ctx.fillRect(0, 0, w, h)
  } else {
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, w, h)
  }

  const rMax = cfg.thickness / 2
  for (const worm of worms) {
    const n = worm.segs.length
    for (let i = n - 1; i >= 0; i--) {
      const fr = n === 1 ? 0 : i / (n - 1)
      const r = rMax * (1 - cfg.taper * fr)
      if (r < 0.4) continue
      const seg = worm.segs[i]
      // opaque core — overlapping discs fuse into a smooth body (no additive glow,
      // so density never blows out to white)
      ctx.fillStyle = segColor(worm, fr, cfg)
      ctx.beginPath()
      ctx.arc(seg.x, seg.y, r, 0, Math.PI * 2)
      ctx.fill()
      // glossy sheen — a small lightened highlight offset toward the top-left,
      // giving the rolling lava-lamp caterpillar look
      if (r > 1.5) {
        ctx.fillStyle = highlight(worm, fr, cfg)
        ctx.beginPath()
        ctx.arc(seg.x - r * 0.3, seg.y - r * 0.3, r * 0.42, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}

function highlight(worm: Worm, fr: number, cfg: WormConfig): string {
  let hue: number
  if (cfg.colorMode === 'rainbow') hue = worm.t * 300 // fan by flock slot ONLY — a random hue0 base swamped the spectral read (#271)
  else if (cfg.colorMode === 'shift-along-body') hue = worm.hue0 + fr * cfg.bodyHueShift
  else hue = worm.hue0
  return rgba(hslToRgb(hue, cfg.saturation * 0.6, Math.min(96, cfg.lightness + 32)), 0.4)
}

function bgTriplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}
