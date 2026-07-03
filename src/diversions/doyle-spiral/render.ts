import type { DoyleCircle } from './doyle'
import type { SpiralState } from './spiral'

// The spiral MOVES every frame (loxodromic flow), so nothing can be baked like the
// Apollonian gasket — we clear and redraw the visible circles each frame onto an
// offscreen art canvas (device px), then composite: background live on the main
// context, an optional per-frame bloom underneath, then the art. Circle counts are
// bounded (hundreds visible after culling), so a full redraw + one blur holds 60fps.

interface RenderBuf {
  art: HTMLCanvasElement
  actx: CanvasRenderingContext2D
  bloom: HTMLCanvasElement
  bctx: CanvasRenderingContext2D
  w: number // device px
  h: number
}
const bufs = new WeakMap<SpiralState, RenderBuf>()

function ensureBuf(s: SpiralState, ctx: CanvasRenderingContext2D): RenderBuf {
  const cw = ctx.canvas.width
  const ch = ctx.canvas.height
  let buf = bufs.get(s)
  if (!buf || buf.w !== cw || buf.h !== ch) {
    const art = document.createElement('canvas')
    art.width = cw
    art.height = ch
    const bloom = document.createElement('canvas')
    bloom.width = cw
    bloom.height = ch
    buf = { art, actx: art.getContext('2d')!, bloom, bctx: bloom.getContext('2d')!, w: cw, h: ch }
    bufs.set(s, buf)
  }
  return buf
}

/** Colour for a circle given its screen radius / angle, via the baked LUT (zero
 *  allocation on the hot path). radius → concentric bands keyed to the packing's
 *  self-similar period (one palette cycle per ×modA step) so they sit on circle
 *  "generations" and stay put while circles flow through them; arm → one hue per
 *  spiral arm; angle → a colour wheel. ink → flat (lut[0]). The LUT is cyclic, so
 *  we wrap t into [0,1) before indexing (radius-mode t runs far outside [0,1)). */
function colorFor(s: SpiralState, c: DoyleCircle, screenRad: number, ang: number, logModA: number): string {
  const lut = s.lut
  if (s.cfg.style === 'ink') return lut[0]
  let t: number
  if (s.cfg.colorBy === 'arm') {
    t = c.arm / s.q
  } else if (s.cfg.colorBy === 'angle') {
    t = ang / (2 * Math.PI) + 0.5
  } else {
    t = Math.log(screenRad) / logModA // radius bands
  }
  const f = t - Math.floor(t) // wrap to [0,1)
  let i = (f * lut.length) | 0
  if (i >= lut.length) i = lut.length - 1
  return lut[i]
}

export function render(s: SpiralState, ctx: CanvasRenderingContext2D): void {
  const buf = ensureBuf(s, ctx)
  const dpr = buf.w / s.w
  const g = buf.actx
  g.setTransform(dpr, 0, 0, dpr, 0, 0) // draw in CSS px; offscreen is device px

  // ── the loxodromic flow transform: multiply every centre by M = a^phase ──
  // M = modA^phase · e^{i(argA·phase + rotPhase)}. At phase→1, M = a exactly, a
  // lattice symmetry, so the loop is seamless.
  const mMod = Math.pow(s.gen.modA, s.phase)
  const mArg = s.gen.argA * s.phase + s.rotPhase
  const cosA = Math.cos(mArg)
  const sinA = Math.sin(mArg)
  const cx = s.w / 2
  const cy = s.h / 2
  const scale = s.fitScale * mMod
  const logModA = Math.log(s.gen.modA) || 1
  const minPx = s.minVisPx
  const style = s.cfg.style
  const lw = s.cfg.lineWidth

  g.clearRect(0, 0, s.w, s.h)
  for (const c of s.circles) {
    const screenRad = c.rad * scale
    if (screenRad < minPx) continue
    // rotate+scale the centre (same M as the radius), then translate to centre
    const rx = (c.x * cosA - c.y * sinA) * scale
    const ry = (c.x * sinA + c.y * cosA) * scale
    const px = cx + rx
    const py = cy + ry
    // cull fully-offscreen
    if (px + screenRad < 0 || px - screenRad > s.w || py + screenRad < 0 || py - screenRad > s.h) continue
    const ang = Math.atan2(ry, rx)
    const col = colorFor(s, c, screenRad, ang, logModA)
    g.beginPath()
    g.arc(px, py, screenRad, 0, 2 * Math.PI)
    if (style === 'rings') {
      g.strokeStyle = col
      g.lineWidth = Math.max(0.4, Math.min(lw, screenRad))
      g.stroke()
    } else {
      g.fillStyle = col
      g.fill()
    }
  }

  // ── composite onto the main context ──
  ctx.fillStyle = s.cfg.background
  ctx.fillRect(0, 0, s.w, s.h)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0) // device px, 1:1 blit
  if (s.cfg.glow > 0) {
    buf.bctx.setTransform(1, 0, 0, 1, 0, 0)
    buf.bctx.clearRect(0, 0, buf.w, buf.h)
    buf.bctx.filter = `blur(${(s.cfg.glow * 6 + 1) * dpr}px)`
    buf.bctx.drawImage(buf.art, 0, 0)
    buf.bctx.filter = 'none'
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.35 + s.cfg.glow * 0.5
    ctx.drawImage(buf.bloom, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.drawImage(buf.art, 0, 0)
  ctx.restore()
}

export function disposeRender(s: SpiralState): void {
  bufs.delete(s)
}
