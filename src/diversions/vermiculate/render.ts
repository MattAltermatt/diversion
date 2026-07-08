import { sampleCyclic } from '../../framework/gradient'
import type { VermiculateState } from './sim'

// ─── Rendering ───────────────────────────────────────────────────────────────
// Every worm track is stamped ONCE onto a persistent accumulation buffer (device
// px, transparent where empty) — true turtle-graphics ink, never redrawn or
// decayed (avoids the sparse-stroke-decays-to-grey trap: nothing repaints
// already-drawn pixels). Each frame we only stroke the segments crawled since the
// last frame, then composite: background live (so bg/palette edits show
// immediately for new ink), buffer on top, with an optional cached bloom pass
// (mirrors dla.ts's baked-buffer + live-bg pattern).

interface RenderBuf {
  canvas: HTMLCanvasElement
  bctx: CanvasRenderingContext2D
  bloom: HTMLCanvasElement
  bloomCtx: CanvasRenderingContext2D
  w: number
  h: number
  bloomSig: string
}

const bufs = new WeakMap<VermiculateState, RenderBuf>()

function ensureBuf(s: VermiculateState, ctx: CanvasRenderingContext2D): RenderBuf {
  const cw = ctx.canvas.width
  const ch = ctx.canvas.height
  let buf = bufs.get(s)
  if (!buf || buf.w !== cw || buf.h !== ch) {
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const bloom = document.createElement('canvas')
    bloom.width = cw
    bloom.height = ch
    buf = { canvas, bctx: canvas.getContext('2d')!, bloom, bloomCtx: bloom.getContext('2d')!, w: cw, h: ch, bloomSig: '' }
    bufs.set(s, buf)
  }
  return buf
}

function rampColor(colors: string[], u: number): string {
  const c = sampleCyclic(colors.map((x) => x + 'ff'), u)
  return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`
}

export function renderVermiculate(s: VermiculateState, ctx: CanvasRenderingContext2D): void {
  const buf = ensureBuf(s, ctx)
  const dpr = s.w > 0 ? ctx.canvas.width / s.w : 1
  const changed = s.fresh.length > 0

  if (changed) {
    buf.bctx.save()
    buf.bctx.setTransform(dpr, 0, 0, dpr, 0, 0) // segments are in CSS px; buffer is device px
    buf.bctx.lineCap = 'round'
    buf.bctx.lineJoin = 'round'
    buf.bctx.lineWidth = s.cfg.trailWidth
    for (const seg of s.fresh) {
      buf.bctx.strokeStyle = rampColor(s.cfg.colors, seg.u)
      buf.bctx.beginPath()
      buf.bctx.moveTo(seg.x0, seg.y0)
      buf.bctx.lineTo(seg.x1, seg.y1)
      buf.bctx.stroke()
    }
    buf.bctx.restore()
    s.fresh.length = 0
  }

  ctx.fillStyle = s.cfg.background
  ctx.fillRect(0, 0, s.w, s.h)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0) // draw the device-px buffer 1:1

  if (s.cfg.glow > 0) {
    const bloomSig = `${s.cfg.glow}|${dpr}`
    if (changed || bloomSig !== buf.bloomSig) {
      buf.bloomCtx.clearRect(0, 0, buf.w, buf.h)
      buf.bloomCtx.filter = `blur(${(s.cfg.glow * 5 + 1) * dpr}px)`
      buf.bloomCtx.drawImage(buf.canvas, 0, 0)
      buf.bloomCtx.filter = 'none'
      buf.bloomSig = bloomSig
    }
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.3 + s.cfg.glow * 0.4
    ctx.drawImage(buf.bloom, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  ctx.drawImage(buf.canvas, 0, 0)
  ctx.restore()
}

export function disposeVermiculateRender(s: VermiculateState): void {
  bufs.delete(s)
}
