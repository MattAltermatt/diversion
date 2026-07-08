// State + per-frame orchestration: bakes the backdrop + bead sprite + trail
// buffer once in setup (never per frame), steps the droplet sim, and composites
// backdrop -> wet trail -> beads each frame.

import { mulberry32 } from '../../framework/rng'
import { BACKDROP_W, BACKDROP_H, buildBackdropData } from './backdrop'
import { spawnInitialDrops, stepDrop, absorbOverlaps, createDrop, type Drop } from './drops'
import type { RainOnGlassConfig } from './schema'

export interface RainOnGlassState {
  cfg: RainOnGlassConfig
  w: number
  h: number
  drops: Drop[]
  rng: () => number
  t: number
  backdrop: HTMLCanvasElement // fixed low-res bake, stretched at draw time
  trail: HTMLCanvasElement // viewport-sized persistence buffer (wet streaks)
  trailCtx: CanvasRenderingContext2D
  bead: HTMLCanvasElement // baked lens-bead sprite, drawImage'd per drop
}

const BEAD_SPRITE = 96

/** Baked once: a glassy lens bead — dark meniscus core, bright rim, small
 *  offset specular highlight. drawImage'd per drop instead of allocating a
 *  fresh radial gradient every frame for every bead. */
function bakeBeadSprite(): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = BEAD_SPRITE
  cv.height = BEAD_SPRITE
  const c = cv.getContext('2d')!
  const cx = BEAD_SPRITE / 2, cy = BEAD_SPRITE / 2, R = BEAD_SPRITE / 2 - 2

  const core = c.createRadialGradient(cx, cy, 0, cx, cy, R)
  core.addColorStop(0, 'rgba(0,0,0,0.34)')
  core.addColorStop(0.55, 'rgba(0,0,0,0.12)')
  core.addColorStop(0.82, 'rgba(255,255,255,0.10)')
  core.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = core
  c.beginPath()
  c.arc(cx, cy, R, 0, Math.PI * 2)
  c.fill()

  // bright rim ring — where the water catches the backdrop light
  c.lineWidth = R * 0.16
  c.strokeStyle = 'rgba(255,255,255,0.55)'
  c.beginPath()
  c.arc(cx, cy, R - c.lineWidth * 0.6, 0, Math.PI * 2)
  c.stroke()

  // small offset specular glint
  const hl = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, 0, cx - R * 0.35, cy - R * 0.4, R * 0.35)
  hl.addColorStop(0, 'rgba(255,255,255,0.92)')
  hl.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = hl
  c.beginPath()
  c.arc(cx - R * 0.35, cy - R * 0.4, R * 0.35, 0, Math.PI * 2)
  c.fill()

  return cv
}

/** Bake the low-res backdrop bloom field into a fixed-size offscreen canvas,
 *  softened once at bake time (cheap — the canvas is tiny). Resolution-
 *  independent of the viewport, so a resize never needs a rebake. */
function bakeBackdrop(cfg: RainOnGlassConfig): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = BACKDROP_W
  cv.height = BACKDROP_H
  const c = cv.getContext('2d')!
  const img = c.createImageData(BACKDROP_W, BACKDROP_H)
  img.data.set(buildBackdropData(cfg))
  c.putImageData(img, 0, 0)
  c.filter = 'blur(3px)'
  c.drawImage(cv, 0, 0)
  c.filter = 'none'
  return cv
}

export function createState(cfg: RainOnGlassConfig, w: number, h: number): RainOnGlassState {
  const rng = mulberry32((cfg.seed ^ 0x9e3779b9) >>> 0)
  const trail = document.createElement('canvas')
  trail.width = w
  trail.height = h
  return {
    cfg,
    w,
    h,
    drops: spawnInitialDrops(cfg, w, h, rng),
    rng,
    t: 0,
    backdrop: bakeBackdrop(cfg),
    trail,
    trailCtx: trail.getContext('2d')!,
    bead: bakeBeadSprite(),
  }
}

/** Apply a config change to a live state. Only `seed` is structural (it
 *  reseeds both the drop layout and the backdrop) — everything else is either
 *  read live from state.cfg each frame (density/condensation/slideThreshold/
 *  trailLength/hueDrift) or, for the backdrop-affecting fields, rebaked here
 *  in place without a full teardown+setup. */
export function updateState(state: RainOnGlassState, cfg: RainOnGlassConfig): boolean {
  if (cfg.seed !== state.cfg.seed) return false
  const backdropChanged = cfg.numLights !== state.cfg.numLights
    || cfg.background !== state.cfg.background
    || JSON.stringify(cfg.palette) !== JSON.stringify(state.cfg.palette)
  state.cfg = cfg
  if (backdropChanged) state.backdrop = bakeBackdrop(cfg)
  return true
}

export function resizeState(state: RainOnGlassState, w: number, h: number): void {
  state.w = w
  state.h = h
  // Trail buffer must match the viewport, so a resize necessarily wipes it —
  // acceptable (wet streaks regenerate as drops keep sliding). The backdrop is
  // resolution-independent (fixed low-res bake stretched at draw time), so it's
  // untouched here — matches the viewport-independent-geometry-resize gotcha.
  state.trail.width = w
  state.trail.height = h
  state.trailCtx = state.trail.getContext('2d')!
}

const TRAIL_MIN_FRAMES = 6
const TRAIL_MAX_FRAMES = 220
/** trailLength 0..100 -> per-frame fade alpha (perceptually even; higher = longer trail). */
function trailFadeAlpha(trailLength: number): number {
  const t = Math.min(1, Math.max(0, trailLength / 100))
  const frames = TRAIL_MIN_FRAMES + t * (TRAIL_MAX_FRAMES - TRAIL_MIN_FRAMES)
  return 1 / frames
}

const SPAWN_RATE_PER_SEC = 40 // cap on new drops/sec so replenishing never pops in visibly
const HUE_DRIFT_DEG_PER_MS = 0.006

export function stepRain(state: RainOnGlassState, ctx: CanvasRenderingContext2D, dt: number): void {
  const { cfg, w, h, rng } = state
  state.t += dt
  const dtSec = dt / 1000

  // 1 - physics: grow/slide every drop, absorb overlaps, cull off-glass drops
  for (const d of state.drops) stepDrop(d, cfg, dt)
  state.drops = absorbOverlaps(state.drops)
  state.drops = state.drops.filter((d) => !(d.sliding && d.y - d.r > h))

  // 2 - replenish toward target density (gradual — no visible pop-in)
  const deficit = cfg.density - state.drops.length
  if (deficit > 0) {
    const spawnCount = Math.min(deficit, Math.max(1, Math.round(SPAWN_RATE_PER_SEC * dtSec)))
    for (let i = 0; i < spawnCount; i++) state.drops.push(createDrop(rng, w, h))
  }

  // 3 - wet trail: fade existing streaks, then stamp fresh ones for sliders
  const tctx = state.trailCtx
  tctx.globalCompositeOperation = 'destination-out'
  tctx.fillStyle = `rgba(0,0,0,${trailFadeAlpha(cfg.trailLength)})`
  tctx.fillRect(0, 0, w, h)
  tctx.globalCompositeOperation = 'source-over'
  for (const d of state.drops) {
    if (!d.sliding) continue
    tctx.strokeStyle = `rgba(210,230,255,${(0.10 + Math.min(0.25, d.mass * 0.05)).toFixed(3)})`
    tctx.lineWidth = Math.max(1, d.r * 0.55)
    tctx.lineCap = 'round'
    tctx.beginPath()
    tctx.moveTo(d.x, d.prevY)
    tctx.lineTo(d.x, d.y)
    tctx.stroke()
  }

  // 4 - composite: backdrop (slowly hue-drifting), wet trail, beads on top
  ctx.save()
  ctx.filter = cfg.hueDrift > 0 ? `hue-rotate(${(state.t * cfg.hueDrift * HUE_DRIFT_DEG_PER_MS) % 360}deg)` : 'none'
  ctx.drawImage(state.backdrop, 0, 0, w, h)
  ctx.restore()
  ctx.drawImage(state.trail, 0, 0)

  for (const d of state.drops) {
    const size = d.r * 2.3 // sprite bakes in soft falloff margin
    const stretch = d.sliding ? Math.min(1.6, 1 + d.vy / 240) : 1
    ctx.save()
    ctx.translate(d.x, d.y)
    ctx.scale(1, stretch)
    ctx.drawImage(state.bead, -size / 2, -size / 2, size, size)
    ctx.restore()
  }
}
