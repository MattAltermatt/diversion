import { mulberry32 } from '../../framework/rng'
import type { HaloConfig } from './schema'

export interface Emitter {
  x: number
  y: number
  vx: number // drift velocity, px/s
  vy: number
  angle: number // drift direction, radians — seed-stable so a live speed edit keeps direction
  tint: number // index into cfg.color.tints (spectrum mode)
}

export interface HaloState {
  emitters: Emitter[]
  cfg: HaloConfig
  w: number
  h: number
  t: number // sim clock, ms (drives the hue drift)
}

function makeEmitters(cfg: HaloConfig, w: number, h: number): Emitter[] {
  const rng = mulberry32(cfg.seed >>> 0)
  const emitters: Emitter[] = []
  // Keep centers off the extreme edge so both halos of a pair genuinely overlap
  // the interior — where the fringes are watched.
  const inset = 0.15
  for (let i = 0; i < cfg.emitters; i++) {
    const angle = rng() * Math.PI * 2
    emitters.push({
      x: (inset + rng() * (1 - 2 * inset)) * w,
      y: (inset + rng() * (1 - 2 * inset)) * h,
      vx: Math.cos(angle) * cfg.driftSpeed,
      vy: Math.sin(angle) * cfg.driftSpeed,
      angle,
      tint: i,
    })
  }
  return emitters
}

export function createHaloState(cfg: HaloConfig, w: number, h: number): HaloState {
  return { emitters: makeEmitters(cfg, w, h), cfg, w, h, t: 0 }
}

/** The static concentric ring radii of one halo: k*spacing for k = 1..ringCount.
 *  Fixed (independent of time) — the moire comes from OVERLAP, not expansion, so
 *  the drifting centers alone reorganize the fringes. Pure. */
export function haloRadii(spacing: number, ringCount: number): number[] {
  const radii: number[] = []
  for (let k = 1; k <= ringCount; k++) radii.push(k * spacing)
  return radii
}

/** The outermost reach of a halo = ringCount * spacing. */
export function haloReach(cfg: HaloConfig): number {
  return cfg.ringCount * cfg.ringSpacing
}

/** True when at least one pair of emitters is close enough that their ring
 *  families overlap (center distance < the sum of their reaches) — the condition
 *  for moire to be possible. Headline invariant. Pure. */
export function anyOverlap(state: HaloState): boolean {
  const reach = haloReach(state.cfg)
  const { emitters } = state
  for (let i = 0; i < emitters.length; i++) {
    for (let j = i + 1; j < emitters.length; j++) {
      const d = Math.hypot(emitters[i].x - emitters[j].x, emitters[i].y - emitters[j].y)
      if (d < reach * 2) return true
    }
  }
  return false
}

/** Advance the sim by dt ms: drift every center and bounce it off the edges. The
 *  ring geometry itself is static — only the centers move. */
export function stepHalo(state: HaloState, dt: number): void {
  state.t += dt
  const dts = dt / 1000
  for (const e of state.emitters) {
    e.x += e.vx * dts
    e.y += e.vy * dts
    if (e.x < 0) { e.x = 0; e.vx = -e.vx } else if (e.x > state.w) { e.x = state.w; e.vx = -e.vx }
    if (e.y < 0) { e.y = 0; e.vy = -e.vy } else if (e.y > state.h) { e.y = state.h; e.vy = -e.vy }
  }
}

/** Rotate a #rrggbb hex's hue by `deg` degrees, returning an rgb() string. Used
 *  for the mono-mode hue drift. Renderer-local. */
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

function strokeHalo(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  radii: number[], color: string, lineWidth: number,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  for (const r of radii) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
  }
}

/** Draw one frame: background, then every halo's static ring family composited
 *  in the mode's blend. Spectrum uses additive light (crossings brighten into
 *  luminous nodes); mono uses `difference` so equal-ink crossings cancel toward
 *  black — the classic XOR moire fringe. Redrawn fresh each frame; the moire is
 *  the live overlap of the drifting families. */
export function drawHalo(state: HaloState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h } = state
  const dpr = ctx.canvas.width / w
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = cfg.color.background
  ctx.fillRect(0, 0, w, h)

  const radii = haloRadii(cfg.ringSpacing, cfg.ringCount)

  if (cfg.color.mode === 'spectrum') {
    ctx.globalCompositeOperation = 'lighter'
    const tints = cfg.color.tints
    for (const e of state.emitters) {
      strokeHalo(ctx, e.x, e.y, radii, tints[e.tint % tints.length], cfg.lineWidth)
    }
  } else {
    ctx.globalCompositeOperation = 'difference'
    const ink = cfg.color.hueDrift > 0
      ? hueShift(cfg.color.ink, (state.t / 1000) * cfg.color.hueDrift)
      : cfg.color.ink
    for (const e of state.emitters) {
      strokeHalo(ctx, e.x, e.y, radii, ink, cfg.lineWidth)
    }
  }

  // Restore for the framework.
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

/** Live-apply a config change. Emitter-count and seed changes rebuild the layout,
 *  so they return false (framework re-runs setup); everything else applies live. */
export function updateHaloState(state: HaloState, cfg: HaloConfig, w: number, h: number): boolean {
  if (cfg.emitters !== state.cfg.emitters || cfg.seed !== state.cfg.seed) return false
  if (cfg.driftSpeed !== state.cfg.driftSpeed) {
    // Recompute velocity from the seed-stable angle so direction survives a live
    // speed edit — including recovery from a previous speed of 0.
    for (const e of state.emitters) {
      e.vx = Math.cos(e.angle) * cfg.driftSpeed
      e.vy = Math.sin(e.angle) * cfg.driftSpeed
    }
  }
  state.cfg = cfg
  state.w = w
  state.h = h
  return true
}

/** Reposition centers proportionally into the new size. */
export function resizeHaloState(state: HaloState, w: number, h: number): void {
  const sx = w / state.w, sy = h / state.h
  for (const e of state.emitters) {
    e.x = Math.min(w, e.x * sx)
    e.y = Math.min(h, e.y * sy)
  }
  state.w = w
  state.h = h
}
