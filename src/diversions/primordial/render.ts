// render.ts — draws the particle soup. Density-coloured dots via a cached 256-entry
// LUT (per-frame palette rebuild is the #1 jank), counting-sorted into colour bins so
// each frame is ≤512 fill() calls (halo pass + core pass) instead of one per particle.
// The world torus is cover-fitted to the canvas; dot radius stays constant in screen px.
import { parseHex6, rgba } from '../../framework/color'
import { sampleGradientRGBA, trailFadeAlpha } from '../../framework/gradient'
import { WORLD, type PPSystem } from './pps'
import type { PrimordialConfig } from './schema'

const LUT_SIZE = 256
const TAU = Math.PI * 2
const HALO_SCALE = 2.6
const HALO_ALPHA = 0.16

export interface RenderState {
  core: string[] // opaque core colour per bin
  halo: string[] // low-alpha halo colour per bin
  key: string // colours identity → rebuild LUT only when it changes
  // counting-sort scratch (reused every frame, zero per-frame allocation)
  binCount: Int32Array
  binStart: Int32Array
  cursor: Int32Array
  order: Int32Array
}

export function makeRenderState(cfg: PrimordialConfig, n: number): RenderState {
  const rs: RenderState = {
    core: new Array(LUT_SIZE),
    halo: new Array(LUT_SIZE),
    key: '',
    binCount: new Int32Array(LUT_SIZE),
    binStart: new Int32Array(LUT_SIZE),
    cursor: new Int32Array(LUT_SIZE),
    order: new Int32Array(n),
  }
  buildLut(rs, cfg)
  return rs
}

/** Rebuild the colour LUT when the ramp changes. Cheap; called from setup/update. */
export function buildLut(rs: RenderState, cfg: PrimordialConfig): void {
  const key = cfg.colors.join(',')
  if (key === rs.key) return
  rs.key = key
  for (let k = 0; k < LUT_SIZE; k++) {
    const c = sampleGradientRGBA(cfg.colors, k / (LUT_SIZE - 1))
    rs.core[k] = `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`
    rs.halo[k] = `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${HALO_ALPHA})`
  }
}

/** Grow the reusable order buffer if the particle count rose (structural re-setup
 *  makes a fresh RenderState anyway, but keep this defensive). */
function ensureOrder(rs: RenderState, n: number): void {
  if (rs.order.length < n) rs.order = new Int32Array(n)
}

export function drawSystem(
  ctx: CanvasRenderingContext2D,
  s: PPSystem,
  cfg: PrimordialConfig,
  cw: number,
  ch: number,
  rs: RenderState,
): void {
  // afterglow / clear
  if (cfg.afterglow <= 0) {
    ctx.fillStyle = rgba(parseHex6(cfg.background), 1)
  } else {
    ctx.fillStyle = rgba(parseHex6(cfg.background), trailFadeAlpha(cfg.afterglow))
  }
  ctx.fillRect(0, 0, cw, ch)

  const n = s.n
  ensureOrder(rs, n)
  // cover-fit the square world to the canvas
  const scale = Math.max(cw / WORLD, ch / WORLD)
  const ox = (cw - WORLD * scale) / 2
  const oy = (ch - WORLD * scale) / 2

  // counting sort particle indices into colour bins by neighbour count
  const neigh = s.neighbors
  const colorMax = Math.max(1, cfg.colorMax)
  const binCount = rs.binCount, binStart = rs.binStart, cursor = rs.cursor, order = rs.order
  binCount.fill(0)
  for (let i = 0; i < n; i++) {
    let b = Math.floor((neigh[i] / colorMax) * (LUT_SIZE - 1))
    if (b < 0) b = 0; else if (b >= LUT_SIZE) b = LUT_SIZE - 1
    binCount[b]++
  }
  let acc = 0
  for (let b = 0; b < LUT_SIZE; b++) { binStart[b] = acc; cursor[b] = acc; acc += binCount[b] }
  for (let i = 0; i < n; i++) {
    let b = Math.floor((neigh[i] / colorMax) * (LUT_SIZE - 1))
    if (b < 0) b = 0; else if (b >= LUT_SIZE) b = LUT_SIZE - 1
    order[cursor[b]++] = i
  }

  const x = s.x, y = s.y
  const coreR = cfg.dotSize
  const haloR = coreR * HALO_SCALE

  // halo pass (under), then opaque core pass — layered source-over keeps hue at density
  if (cfg.halo) {
    for (let b = 0; b < LUT_SIZE; b++) {
      const cnt = binCount[b]; if (cnt === 0) continue
      ctx.fillStyle = rs.halo[b]
      ctx.beginPath()
      const start = binStart[b], end = start + cnt
      for (let k = start; k < end; k++) {
        const i = order[k]
        const sx = ox + x[i] * scale, sy = oy + y[i] * scale
        ctx.moveTo(sx + haloR, sy)
        ctx.arc(sx, sy, haloR, 0, TAU)
      }
      ctx.fill()
    }
  }
  for (let b = 0; b < LUT_SIZE; b++) {
    const cnt = binCount[b]; if (cnt === 0) continue
    ctx.fillStyle = rs.core[b]
    ctx.beginPath()
    const start = binStart[b], end = start + cnt
    for (let k = start; k < end; k++) {
      const i = order[k]
      const sx = ox + x[i] * scale, sy = oy + y[i] * scale
      ctx.moveTo(sx + coreR, sy)
      ctx.arc(sx, sy, coreR, 0, TAU)
    }
    ctx.fill()
  }
}
