import { sampleCyclic, sampleGradientRGBA } from '../../framework/gradient'
import type { Circle } from './apollonian'
import type { GasketState } from './gasket'

// The gasket is static once generated, so we bake it — like DLA — onto a
// persistent art buffer (device px, transparent where empty) and only stamp the
// circles revealed since the last frame. The background is composited LIVE so bg
// edits show without a rebake; an appearance edit (palette/style/glow) flips
// needsFullRedraw to rebake from scratch. The whole baked buffer is blitted with
// a rotation transform about centre, so a slow spin costs one rotated drawImage
// rather than re-stamping thousands of circles. An offscreen bloom re-blurs only
// when the art or glow changes. Colour is sampled directly per circle (each is
// stamped exactly once, ever — so no LUT is needed on the hot path).

const FIT = 0.94 // gasket diameter as a fraction of the shorter viewport axis

interface RenderBuf {
  art: HTMLCanvasElement
  actx: CanvasRenderingContext2D
  bloom: HTMLCanvasElement
  bctx: CanvasRenderingContext2D
  w: number
  h: number
  stamped: number // how many of state.circles are already on the art buffer
  bloomGlow: number // cached bloom inputs (numeric compare — no per-frame string)
  bloomDpr: number
}
const bufs = new WeakMap<GasketState, RenderBuf>()

/** Colour for a circle. Depth mode cycles the palette shell-by-shell (each
 *  recursion generation a distinct vivid hue — the classic stained-glass look);
 *  size mode ramps the palette across log-radius so scale reads as a gradient. */
function colorFor(s: GasketState, stops: string[], c: Circle): string {
  let col
  if (s.cfg.style === 'ink') {
    col = sampleGradientRGBA(stops, 1)
  } else if (s.cfg.colorBy === 'depth') {
    col = sampleCyclic(stops, c.depth / stops.length)
  } else {
    const lo = Math.log(s.kMin)
    const hi = Math.log(Math.max(s.kMax, s.kMin * 1.0001))
    const t = (Math.log(c.k) - lo) / (hi - lo)
    col = sampleGradientRGBA(stops, t)
  }
  return `rgb(${col.r | 0}, ${col.g | 0}, ${col.b | 0})`
}

function stamp(s: GasketState, buf: RenderBuf, stops: string[], c: Circle): void {
  const scale = 0.5 * Math.min(buf.w, buf.h) * FIT
  const cx = buf.w / 2
  const cy = buf.h / 2
  const sx = c.x * scale + cx
  const sy = c.y * scale + cy
  const r = (1 / Math.abs(c.k)) * scale
  const g = buf.actx

  if (c.k < 0) {
    // bounding circle — a stroked boundary ring (or nothing)
    if (!s.cfg.boundary) return
    g.strokeStyle = colorFor(s, stops, { ...c, k: s.kMin, depth: 0 })
    g.lineWidth = Math.max(1, s.cfg.lineWidth * (buf.w / s.w))
    g.beginPath()
    g.arc(sx, sy, r, 0, 2 * Math.PI)
    g.stroke()
    return
  }
  if (r < 0.35) return // sub-pixel — invisible, skip the fill
  g.beginPath()
  g.arc(sx, sy, r, 0, 2 * Math.PI)
  if (s.cfg.style === 'rings') {
    g.strokeStyle = colorFor(s, stops, c)
    g.lineWidth = Math.max(0.5, s.cfg.lineWidth * (buf.w / s.w))
    g.stroke()
  } else {
    g.fillStyle = colorFor(s, stops, c)
    g.fill()
  }
}

function ensureBuf(s: GasketState, ctx: CanvasRenderingContext2D): RenderBuf {
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
    buf = {
      art, actx: art.getContext('2d')!,
      bloom, bctx: bloom.getContext('2d')!,
      w: cw, h: ch, stamped: 0, bloomGlow: -1, bloomDpr: -1,
    }
    bufs.set(s, buf)
    s.needsFullRedraw = true
  }
  return buf
}

export function render(s: GasketState, ctx: CanvasRenderingContext2D): void {
  const buf = ensureBuf(s, ctx)
  const stops = s.stops // cached; rebuilt off the hot path when colours change
  let changed = false

  if (s.needsFullRedraw) {
    buf.actx.clearRect(0, 0, buf.w, buf.h)
    buf.stamped = 0
    s.needsFullRedraw = false
  }
  if (buf.stamped < s.revealed) {
    for (let i = buf.stamped; i < s.revealed; i++) stamp(s, buf, stops, s.circles[i])
    buf.stamped = s.revealed
    changed = true
  }

  // composite: background live, then the baked gasket rotated about centre, with
  // an optional cached bloom underneath.
  ctx.fillStyle = s.cfg.background
  ctx.fillRect(0, 0, s.w, s.h)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0) // device px, 1:1
  const cx = buf.w / 2
  const cy = buf.h / 2
  ctx.translate(cx, cy)
  ctx.rotate(s.rotPhase)
  ctx.translate(-cx, -cy)
  if (s.cfg.glow > 0) {
    const dpr = buf.w / s.w
    if (changed || s.cfg.glow !== buf.bloomGlow || dpr !== buf.bloomDpr) {
      buf.bctx.clearRect(0, 0, buf.w, buf.h)
      buf.bctx.filter = `blur(${(s.cfg.glow * 6 + 1) * dpr}px)`
      buf.bctx.drawImage(buf.art, 0, 0)
      buf.bctx.filter = 'none'
      buf.bloomGlow = s.cfg.glow
      buf.bloomDpr = dpr
    }
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.35 + s.cfg.glow * 0.5
    ctx.drawImage(buf.bloom, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.drawImage(buf.art, 0, 0)
  ctx.restore()
}

export function disposeRender(s: GasketState): void {
  bufs.delete(s)
}
