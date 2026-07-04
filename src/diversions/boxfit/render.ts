import { sampleCyclic } from '../../framework/gradient'
import type { BoxfitState, Shape } from './boxfit'

// ─── Rendering ───────────────────────────────────────────────────────────────
// Frozen shapes are permanent, so each is stamped ONCE onto a persistent
// accumulation buffer (device px) — every frame we stamp only the shapes frozen
// since the last one; a colour edit re-stamps them all from the shape list. The
// background is composited LIVE each frame (so bg / grout colour edits show), and
// the handful of still-growing shapes are drawn live on top of the buffer. A
// palette LUT (256 rgb strings) keeps colour lookups off the per-shape hot path —
// rebuilt only when the palette changes, never per shape (the documented #1-jank
// trap).

const LUT_SIZE = 256

interface RenderBuf {
  canvas: HTMLCanvasElement
  bctx: CanvasRenderingContext2D
  w: number
  h: number
  lut: string[]
  paletteSig: string
}
const bufs = new WeakMap<BoxfitState, RenderBuf>()

function buildLut(colors: string[]): string[] {
  const stops = colors.map((c) => c + 'ff')
  const lut = new Array<string>(LUT_SIZE)
  for (let i = 0; i < LUT_SIZE; i++) {
    const c = sampleCyclic(stops, i / LUT_SIZE)
    lut[i] = `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`
  }
  return lut
}

/** Palette position 0..1 for a shape under the active colour mode. by-size maps a
 *  shape's size to the palette; the other modes carry a fixed colorT. */
function colorT(s: BoxfitState, sh: Shape): number {
  if (s.cfg.colorMode === 'by-size') {
    return Math.min(1, Math.max(0, sh.half / s.maxHalf))
  }
  return sh.colorT
}

function colorFor(s: BoxfitState, buf: RenderBuf, sh: Shape): string {
  const t = ((colorT(s, sh) % 1) + 1) % 1
  return buf.lut[Math.min(LUT_SIZE - 1, (t * LUT_SIZE) | 0)]
}

function stampBuffer(s: BoxfitState, buf: RenderBuf, dpr: number, sh: Shape): void {
  buf.bctx.fillStyle = colorFor(s, buf, sh)
  drawShape(buf.bctx, sh, dpr)
}

/** Draw a shape onto a context already scaled by `scale` (dpr for the buffer, 1
 *  for the live main-context path where the framework's DPR transform is active). */
function drawShape(ctx: CanvasRenderingContext2D, sh: Shape, scale: number): void {
  const cx = sh.cx * scale
  const cy = sh.cy * scale
  if (sh.box) {
    const hw = sh.half * sh.ar * scale
    const hh = sh.half * scale
    ctx.fillRect(cx - hw, cy - hh, 2 * hw, 2 * hh)
  } else {
    ctx.beginPath()
    ctx.arc(cx, cy, sh.half * scale, 0, 2 * Math.PI)
    ctx.fill()
  }
}

function ensureBuf(s: BoxfitState, ctx: CanvasRenderingContext2D): RenderBuf {
  const cw = ctx.canvas.width, ch = ctx.canvas.height
  let buf = bufs.get(s)
  if (!buf || buf.w !== cw || buf.h !== ch) {
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    buf = {
      canvas, bctx: canvas.getContext('2d')!,
      w: cw, h: ch, lut: buildLut(s.cfg.colors), paletteSig: s.cfg.colors.join(),
    }
    bufs.set(s, buf)
    s.needsFullRedraw = true
  }
  const sig = s.cfg.colors.join()
  if (sig !== buf.paletteSig) {
    buf.lut = buildLut(s.cfg.colors)
    buf.paletteSig = sig
  }
  return buf
}

export function render(s: BoxfitState, ctx: CanvasRenderingContext2D): void {
  const buf = ensureBuf(s, ctx)
  const dpr = ctx.canvas.width / s.w

  if (s.needsFullRedraw) {
    buf.bctx.clearRect(0, 0, buf.w, buf.h)
    for (const sh of s.shapes) stampBuffer(s, buf, dpr, sh)
    s.needsFullRedraw = false
    s.fresh.length = 0
  } else if (s.fresh.length) {
    for (const sh of s.fresh) stampBuffer(s, buf, dpr, sh)
    s.fresh.length = 0
  }

  // composite: background live (fills the gaps → the mosaic grout), the frozen
  // buffer 1:1, then the live growing shapes on top (framework DPR transform active).
  ctx.fillStyle = s.cfg.background
  ctx.fillRect(0, 0, s.w, s.h)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(buf.canvas, 0, 0)
  ctx.restore()
  for (const sh of s.growing) {
    ctx.fillStyle = colorFor(s, buf, sh)
    drawShape(ctx, sh, 1)
  }
}

/** Free the buffer for a state (teardown). */
export function disposeRender(s: BoxfitState): void {
  bufs.delete(s)
}
