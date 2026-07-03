import type { RGB } from '../../framework/color'
import { legEndpoints, type HexState } from './grow'

// ─── Render ──────────────────────────────────────────────────────────────────
// Layers, composited on the main context every frame:
//   1. background       — live (updates the instant you edit it)
//   2. hex mesh          — a cached grid image blitted at the LIVE gridOpacity
//   3. arms accumulation — a TRANSPARENT offscreen buffer; completed legs bake in
//                          once, only the growing tips animate per frame
//   4. tips              — the growing front, drawn live on the main ctx
// Keeping background + mesh OUT of the baked buffer is what lets them update live
// (the buffer holds arms only). Glow is a two-layer source-over halo+core (never
// additive 'lighter', which whites out at the six-arm hex junctions).

const GLOW_MAX = 14 // px shadowBlur at glow = 1
const HALO_ALPHA = 0.12
const HALO_WIDTH_FRAC = 0.42 // halo width as a fraction of hexSize
const TIP_BOOST = 0.25 // push the growing tip toward white
const GRID_RGB = '200,210,230' // cool grey hex-mesh tint (opacity applied at blit)

function dprOf(): number {
  const d = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
  return Math.min(d, 2)
}

/** Index the precomputed 256-entry palette LUT (no allocation, no hex re-parse). */
function rgbOf(pal: RGB[], u: number): RGB {
  const i = (u * 255) | 0
  return pal[i < 0 ? 0 : i > 255 ? 255 : i]
}
const css = (c: RGB, a = 1): string => `rgba(${c.r},${c.g},${c.b},${a})`
const smoothstep = (p: number): number => p * p * (3 - 2 * p)

function makeCanvas(w: number, h: number, dpr: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(w * dpr))
  canvas.height = Math.max(1, Math.floor(h * dpr))
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // draw in CSS px, matching the main ctx
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  return { canvas, ctx }
}

interface Buffer {
  arms: HTMLCanvasElement // transparent — accumulated arm legs only
  armsCtx: CanvasRenderingContext2D
  grid: HTMLCanvasElement // full-opacity hex mesh, cached (blitted at live opacity)
  w: number
  h: number
  cycle: number
}
const buffers = new WeakMap<HexState, Buffer>()

/** Bake the hex mesh into its own canvas at full opacity, once. */
function bakeGrid(ctx: CanvasRenderingContext2D, state: HexState): void {
  const s = state.cfg.hexSize
  ctx.clearRect(0, 0, state.w, state.h)
  ctx.lineWidth = 1
  ctx.strokeStyle = `rgba(${GRID_RGB},1)`
  ctx.beginPath()
  for (const c of state.cells) {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30) // pointy-top corners
      const x = c.cx + s * Math.cos(a)
      const y = c.cy + s * Math.sin(a)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }
  ctx.stroke()
}

function ensureBuffer(state: HexState): Buffer {
  let b = buffers.get(state)
  if (b && b.w === state.w && b.h === state.h) return b
  const dpr = dprOf()
  const arms = makeCanvas(state.w, state.h, dpr)
  const grid = makeCanvas(state.w, state.h, dpr)
  bakeGrid(grid.ctx, state)
  b = { arms: arms.canvas, armsCtx: arms.ctx, grid: grid.canvas, w: state.w, h: state.h, cycle: state.cycle }
  buffers.set(state, b)
  return b
}

/** Bake legs completed this frame into the (transparent) arms buffer — halo pass
 *  (all), then crisp core pass (all). */
function bakeSegments(buf: Buffer, state: HexState): void {
  const segs = state.newSegments
  if (segs.length === 0) return
  const ctx = buf.armsCtx
  const { cfg, palette } = state

  if (cfg.glow > 0) {
    ctx.lineWidth = Math.max(1, cfg.hexSize * HALO_WIDTH_FRAC)
    ctx.shadowBlur = cfg.glow * GLOW_MAX
    for (const s of segs) {
      const c = rgbOf(palette, s.u)
      ctx.strokeStyle = css(c, HALO_ALPHA)
      ctx.shadowColor = css(c, 1)
      ctx.beginPath()
      ctx.moveTo(s.x0, s.y0)
      ctx.lineTo(s.x1, s.y1)
      ctx.stroke()
    }
  }
  ctx.shadowBlur = 0
  ctx.lineWidth = cfg.coreWidth
  for (const s of segs) {
    ctx.strokeStyle = css(rgbOf(palette, s.u), 1)
    ctx.beginPath()
    ctx.moveTo(s.x0, s.y0)
    ctx.lineTo(s.x1, s.y1)
    ctx.stroke()
  }
}

/** Fixed-duration eased dissolve of the arms buffer toward transparent (the mesh +
 *  background beneath persist). Frame-rate independent. */
function fadeArms(buf: Buffer, state: HexState, dt: number): void {
  const total = state.cfg.fadeSeconds * 1000
  const pCur = Math.min(1, state.fadeMs / total)
  const pPrev = Math.max(0, Math.min(1, (state.fadeMs - dt) / total))
  const remCur = 1 - smoothstep(pCur)
  const remPrev = 1 - smoothstep(pPrev)
  const a = remPrev > 1e-4 ? Math.min(1, Math.max(0, 1 - remCur / remPrev)) : 1
  const ctx = buf.armsCtx
  ctx.globalCompositeOperation = 'destination-out' // erase existing alpha by factor a
  ctx.fillStyle = `rgba(0,0,0,${a})`
  ctx.fillRect(0, 0, state.w, state.h)
  ctx.globalCompositeOperation = 'source-over'
}

/** Draw the currently-growing tips on the main context (never baked). */
function drawTips(ctx: CanvasRenderingContext2D, state: HexState): void {
  const { cfg, palette } = state
  if (state.activeArms.length === 0) return
  ctx.lineCap = 'round'
  ctx.lineWidth = cfg.coreWidth
  ctx.shadowBlur = cfg.glow > 0 ? cfg.glow * GLOW_MAX : 0
  for (const ref of state.activeArms) {
    const arm = ref.hex.arms[ref.dir]
    const { sx, sy, ex, ey } = legEndpoints(ref.hex, ref.dir, arm.phase)
    const t = Math.min(1, arm.ratio)
    const c = rgbOf(palette, ref.hex.u)
    // brighter tip — pushed toward white, built inline (no per-arm object)
    const tr = Math.round(c.r + (255 - c.r) * TIP_BOOST)
    const tg = Math.round(c.g + (255 - c.g) * TIP_BOOST)
    const tb = Math.round(c.b + (255 - c.b) * TIP_BOOST)
    ctx.shadowColor = css(c, 1)
    ctx.strokeStyle = `rgba(${tr},${tg},${tb},1)`
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx + (ex - sx) * t, sy + (ey - sy) * t)
    ctx.stroke()
  }
  ctx.shadowBlur = 0
}

export function renderHex(state: HexState, ctx: CanvasRenderingContext2D, dt: number): void {
  const buf = ensureBuffer(state)
  if (buf.cycle !== state.cycle) {
    buf.armsCtx.clearRect(0, 0, state.w, state.h) // fresh field on reseed
    buf.cycle = state.cycle
  }
  if (state.phase === 'fade') fadeArms(buf, state, dt)
  else bakeSegments(buf, state)

  // Composite live: background → mesh (at live opacity) → arms → tips.
  ctx.globalCompositeOperation = 'source-over'
  ctx.shadowBlur = 0
  ctx.fillStyle = state.cfg.background
  ctx.fillRect(0, 0, state.w, state.h)
  if (state.cfg.gridOpacity > 0) {
    ctx.globalAlpha = state.cfg.gridOpacity
    ctx.drawImage(buf.grid, 0, 0, state.w, state.h)
    ctx.globalAlpha = 1
  }
  ctx.drawImage(buf.arms, 0, 0, state.w, state.h)
  if (state.phase === 'grow') drawTips(ctx, state)
}
