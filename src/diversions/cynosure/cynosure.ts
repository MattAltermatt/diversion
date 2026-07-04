import { mulberry32 } from '../../framework/rng'
import type { BlendMode, CynosureConfig } from './schema'

// A slowly-recomposing pool of translucent rectangles. Each rectangle drifts,
// (optionally) rotates, lives for a randomized span, then fades out and a fresh
// one fades in — so the composition continuously and calmly recomposes. Nothing
// ever pops: births/deaths ride a fade envelope. The whole pool is repainted
// fresh each frame (no accumulation buffer) so opacity/palette/blend edits apply
// live.

const FADE_FRAC = 0.28   // portion of a life spent fading in, and again fading out
const BASE_SPIN = 0.05   // max rotational speed, rad/sec
const DRIFT_SCALE = 0.012 // fraction-of-canvas per second at driftSpeed = 1, dir mag 1

export type Rect = {
  cx: number      // center, 0..1 across width
  cy: number      // center, 0..1 across height
  size: number    // base size, fraction of the shorter screen edge (in [sizeMin,sizeMax])
  wFrac: number   // width  as fraction of the shorter edge (size * aspect)
  hFrac: number   // height as fraction of the shorter edge (size / aspect)
  colorT: number  // 0..1 index into the palette (resolved live so palette edits apply)
  angle: number   // current rotation, rad
  spin: number    // rotational velocity, rad/sec (sign varies)
  dirx: number    // drift direction x (magnitude ~0.4..1)
  diry: number    // drift direction y
  age: number     // seconds lived
  life: number    // total lifespan, seconds
}

export type CynosureState = {
  cfg: CynosureConfig
  w: number
  h: number
  rng: () => number
  rects: Rect[]
  t: number
}

const BLEND_OP: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
}

/** One fresh rectangle drawn from the seeded stream. `staggered` spreads the
 *  initial age across the lifespan so a fresh pool doesn't all die in unison. */
export function makeRect(rng: () => number, cfg: CynosureConfig, staggered: boolean): Rect {
  const lo = Math.min(cfg.sizeMin, cfg.sizeMax)
  const hi = Math.max(cfg.sizeMin, cfg.sizeMax)
  const size = lo + rng() * (hi - lo)
  const ar = Math.exp((rng() * 2 - 1) * cfg.aspectVar * 1.3)
  const cx = rng()
  const cy = rng()
  const colorT = rng()
  const angle = rng() * Math.PI * 2
  const spin = (rng() * 2 - 1) * BASE_SPIN
  const dAng = rng() * Math.PI * 2
  const dMag = 0.4 + rng() * 0.6
  const life = cfg.lifespan * (0.7 + rng() * 0.6)
  const age = staggered ? rng() * life : 0
  return {
    cx, cy, size, wFrac: size * ar, hFrac: size / ar, colorT,
    angle, spin, dirx: Math.cos(dAng) * dMag, diry: Math.sin(dAng) * dMag,
    age, life,
  }
}

export function buildRects(cfg: CynosureConfig, rng: () => number): Rect[] {
  const rects: Rect[] = []
  for (let i = 0; i < cfg.rectCount; i++) rects.push(makeRect(rng, cfg, true))
  return rects
}

export function createState(cfg: CynosureConfig, w: number, h: number): CynosureState {
  const rng = mulberry32(cfg.seed)
  return { cfg, w, h, rng, rects: buildRects(cfg, rng), t: 0 }
}

/** Rebuild the whole pool from a fresh seeded stream (structural edit / new seed). */
export function rebuild(st: CynosureState): void {
  st.rng = mulberry32(st.cfg.seed)
  st.rects = buildRects(st.cfg, st.rng)
}

/** Advance drift + rotation + lifecycle by dt seconds. Dead rectangles respawn
 *  from the same seeded stream, keeping the pool bounded. */
export function step(st: CynosureState, dt: number): void {
  const { cfg } = st
  const drift = cfg.driftSpeed * DRIFT_SCALE
  for (let i = 0; i < st.rects.length; i++) {
    const r = st.rects[i]
    r.age += dt
    if (r.age >= r.life) {
      st.rects[i] = makeRect(st.rng, cfg, false)
      continue
    }
    r.cx += r.dirx * drift * dt
    r.cy += r.diry * drift * dt
    if (cfg.rotate) r.angle += r.spin * dt
  }
  st.t += dt
}

/** Birth/death fade envelope in 0..1 (0 at the very start/end of a life). */
export function envelope(r: Rect): number {
  const fade = Math.max(0.001, r.life * FADE_FRAC)
  const fadeIn = Math.min(1, r.age / fade)
  const fadeOut = Math.min(1, (r.life - r.age) / fade)
  return Math.max(0, Math.min(fadeIn, fadeOut))
}

export function renderCynosure(st: CynosureState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h } = st
  const minEdge = Math.min(w, h)
  const palette = cfg.palette

  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, w, h)

  ctx.globalCompositeOperation = BLEND_OP[cfg.blend]
  for (const r of st.rects) {
    const alpha = cfg.opacity * envelope(r)
    if (alpha <= 0.001) continue
    const pw = r.wFrac * minEdge
    const ph = r.hFrac * minEdge
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = palette[Math.min(palette.length - 1, (r.colorT * palette.length) | 0)]
    ctx.translate(r.cx * w, r.cy * h)
    ctx.rotate(r.angle)
    if (cfg.rounding > 0) {
      const rad = cfg.rounding * Math.min(pw, ph) * 0.5
      ctx.beginPath()
      ctx.roundRect(-pw / 2, -ph / 2, pw, ph, rad)
      ctx.fill()
    } else {
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph)
    }
    ctx.restore()
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}
