// Renderer for the SPH fluid. Two looks, both reading the same particle state:
//   • 'liquid'    — a cohesive glossy iso-surface (metaball): splat each particle
//                   into a low-res scalar field, threshold it for a smooth surface,
//                   upscale with bilinear smoothing → wobbling connected body.
//   • 'particles' — soft glowing droplets you can see individually.
// Draws in CSS pixels (kind:'2d' — the framework DPR-scales the context). Nothing
// here is imported by the tests; the offscreen canvas is created lazily at runtime.

import { parseHex6, mix, type RGB } from '../../framework/color'
import type { Fluid } from './sph'
import { BOX_H } from './sph'
import type { SphFluidConfig } from './schema'

const FIELD_CELL = 5 // screen px per metaball field cell (upscaled bilinearly)
const LUT_N = 48 // fluid→surface colour ramp resolution

export interface RenderState {
  field: Float32Array // metaball scalar accumulation buffer
  sfield: Float32Array // speed-weighted accumulation (for colorBy:'speed')
  fw: number
  fh: number
  img: ImageData | null // reused each frame (offCtx.createImageData)
  buf: Uint8ClampedArray | null // === img.data
  off: HTMLCanvasElement | null // low-res field canvas, upscaled each frame
  offCtx: CanvasRenderingContext2D | null
  glow: HTMLCanvasElement | null // precomputed radial sprite for particle mode
  lut: RGB[] // fluidColor → surfaceColor ramp
  lutKey: string
}

export function createRenderState(): RenderState {
  return {
    field: new Float32Array(0), sfield: new Float32Array(0), fw: 0, fh: 0,
    img: null, buf: null, off: null, offCtx: null, glow: null, lut: [], lutKey: '',
  }
}

function ensureField(rs: RenderState, w: number, h: number) {
  const fw = Math.max(1, Math.ceil(w / FIELD_CELL) + 1)
  const fh = Math.max(1, Math.ceil(h / FIELD_CELL) + 1)
  if (fw === rs.fw && fh === rs.fh && rs.buf) return
  rs.fw = fw; rs.fh = fh
  rs.field = new Float32Array(fw * fh)
  rs.sfield = new Float32Array(fw * fh)
  const off = document.createElement('canvas')
  off.width = fw; off.height = fh
  rs.off = off
  const offCtx = off.getContext('2d')
  rs.offCtx = offCtx
  rs.img = offCtx ? offCtx.createImageData(fw, fh) : null
  rs.buf = rs.img ? rs.img.data : null
}

function ensureLut(rs: RenderState, fluidHex: string, surfaceHex: string) {
  const key = fluidHex + surfaceHex
  if (key === rs.lutKey && rs.lut.length) return
  const a = parseHex6(fluidHex)
  const b = parseHex6(surfaceHex)
  rs.lut = Array.from({ length: LUT_N }, (_, i) => mix(a, b, i / (LUT_N - 1)))
  rs.lutKey = key
}

function ensureGlow(rs: RenderState): HTMLCanvasElement {
  if (rs.glow) return rs.glow
  const S = 64
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const g = c.getContext('2d')
  if (!g) return c // jsdom without a canvas backend — never happens in a browser
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  rs.glow = c
  return c
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export function renderFluid(
  rs: RenderState, ctx: CanvasRenderingContext2D, fluid: Fluid,
  cfg: SphFluidConfig, w: number, h: number,
) {
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, w, h)
  const scale = h / BOX_H // sim units → screen px (box width tracks aspect exactly)
  ensureLut(rs, cfg.fluidColor, cfg.surfaceColor)
  if (cfg.renderMode === 'particles') renderParticles(rs, ctx, fluid, cfg, scale)
  else renderLiquid(rs, ctx, fluid, cfg, w, h, scale)
}

function renderLiquid(
  rs: RenderState, ctx: CanvasRenderingContext2D, fluid: Fluid,
  cfg: SphFluidConfig, w: number, h: number, scale: number,
) {
  ensureField(rs, w, h)
  const { field, sfield, fw, fh, buf, offCtx, off, img } = rs
  if (!buf || !offCtx || !off || !img) return
  field.fill(0); sfield.fill(0)

  // Splat radius in field cells — tied to the smoothing radius so blobs merge.
  const rPx = 22 * scale * 0.85
  const rCells = Math.max(1.5, rPx / FIELD_CELL)
  const rCellsI = Math.ceil(rCells)
  const invR2 = 1 / (rCells * rCells)
  const bySpeed = cfg.colorBy === 'speed'
  // normalisation for speed colouring — a splash speed that reads as "hot"
  const SPEED_HOT = 90

  for (let i = 0; i < fluid.n; i++) {
    const cx = (fluid.px[i] * scale) / FIELD_CELL
    const cy = (fluid.py[i] * scale) / FIELD_CELL
    const ci = Math.round(cx), cj = Math.round(cy)
    const sv = bySpeed ? Math.min(1, fluid.speed[i] / SPEED_HOT) : 0
    for (let ox = -rCellsI; ox <= rCellsI; ox++) {
      const gx = ci + ox
      if (gx < 0 || gx >= fw) continue
      for (let oy = -rCellsI; oy <= rCellsI; oy++) {
        const gy = cj + oy
        if (gy < 0 || gy >= fh) continue
        const dx = gx - cx, dy = gy - cy
        const d2 = (dx * dx + dy * dy) * invR2
        if (d2 >= 1) continue
        const wgt = (1 - d2) * (1 - d2) // smooth falloff
        const idx = gy * fw + gx
        field[idx] += wgt
        if (bySpeed) sfield[idx] += wgt * sv
      }
    }
  }

  // Field → RGBA. Iso threshold defines the surface; a bright band at the rim
  // gives the glossy sheen, the interior settles to the deep fluid colour.
  const T = 1.1 // iso level (in accumulated-weight units)
  const lut = rs.lut
  const lastLut = lut.length - 1
  for (let p = 0; p < fw * fh; p++) {
    const f = field[p]
    const alpha = smoothstep(T * 0.55, T, f) // antialiased surface edge
    const o = p * 4
    if (alpha <= 0.003) { buf[o + 3] = 0; continue }
    let t: number
    if (cfg.colorBy === 'speed') {
      t = f > 0 ? sfield[p] / f : 0 // avg speed of contributors
    } else {
      // depth: thin rim (f near T) → surface highlight; deep interior → fluid
      t = 1 - smoothstep(T, T * 2.6, f)
    }
    const c = lut[Math.min(lastLut, Math.max(0, Math.round(t * lastLut)))]
    buf[o] = c.r; buf[o + 1] = c.g; buf[o + 2] = c.b
    buf[o + 3] = Math.round(alpha * 255)
  }
  offCtx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(off, 0, 0, w, h)
}

function renderParticles(
  rs: RenderState, ctx: CanvasRenderingContext2D, fluid: Fluid,
  cfg: SphFluidConfig, scale: number,
) {
  const glow = ensureGlow(rs)
  const r = Math.max(2, 22 * scale * 0.42) // droplet radius (px)
  const lut = rs.lut, lastLut = lut.length - 1
  const bySpeed = cfg.colorBy === 'speed'
  const SPEED_HOT = 90
  // atmosphere: soft additive halo (kept low so dense pools don't white out)
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.10
  const gR = r * 2.2
  for (let i = 0; i < fluid.n; i++) {
    ctx.drawImage(glow, fluid.px[i] * scale - gR, fluid.py[i] * scale - gR, gR * 2, gR * 2)
  }
  // opaque coloured cores
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  // depth colouring needs the vertical span of the fluid
  let minY = Infinity, maxY = -Infinity
  if (!bySpeed) {
    for (let i = 0; i < fluid.n; i++) {
      if (fluid.py[i] < minY) minY = fluid.py[i]
      if (fluid.py[i] > maxY) maxY = fluid.py[i]
    }
  }
  const span = Math.max(1, maxY - minY)
  for (let i = 0; i < fluid.n; i++) {
    const t = bySpeed
      ? Math.min(1, fluid.speed[i] / SPEED_HOT)
      : (fluid.py[i] - minY) / span // top (small y) = 0 → surface highlight
    const ti = bySpeed ? t : 1 - t
    const c = lut[Math.min(lastLut, Math.max(0, Math.round(ti * lastLut)))]
    ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`
    ctx.beginPath()
    ctx.arc(fluid.px[i] * scale, fluid.py[i] * scale, r, 0, Math.PI * 2)
    ctx.fill()
  }
}
