import { sampleGradientRGBA } from '../../framework/gradient'
import { SALT_RAMPS, COLOR_REF_DIST, fadeAlpha, type GardenState, type Segment } from './garden'

// ─── Rendering ───────────────────────────────────────────────────────────────
// Growth is real-time (garden.ts advances a step budget every frame), so unlike
// Vines (redraw everything every frame from a precomputed tree) we bake each
// FINISHED segment once into a persistent accumulation buffer the moment it's
// produced — the DLA pattern. Per frame we only stamp what's new (`state.fresh`),
// keeping cost bounded as the garden fills, and only fully rebuild the buffer
// on a resize or a live palette edit (`needsFullRedraw`, DLA's `ages`-grid
// analogue is `state.bakedSegments`, the persistent source of truth).
//
// Two-layer glow (not a single additive pass, which whites out at density): the
// accumulation buffer itself holds OPAQUE colour strokes (the core); a separate
// cached, blurred copy is composited with 'lighter' at partial alpha (the halo).
// The core is always drawn on top at full strength, so hue survives at density.

interface RenderBuf {
  canvas: HTMLCanvasElement
  bctx: CanvasRenderingContext2D
  bloom: HTMLCanvasElement
  bloomCtx: CanvasRenderingContext2D
  w: number
  h: number
  bloomSig: string
}
const bufs = new WeakMap<GardenState, RenderBuf>()

function ensureBuf(s: GardenState, ctx: CanvasRenderingContext2D): RenderBuf {
  const cw = ctx.canvas.width, ch = ctx.canvas.height
  let buf = bufs.get(s)
  if (!buf || buf.w !== cw || buf.h !== ch) {
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const bloom = document.createElement('canvas')
    bloom.width = cw
    bloom.height = ch
    buf = {
      canvas, bctx: canvas.getContext('2d')!,
      bloom, bloomCtx: bloom.getContext('2d')!,
      w: cw, h: ch, bloomSig: '',
    }
    bufs.set(s, buf)
    s.needsFullRedraw = true
  }
  return buf
}

/** Cheap deterministic pseudo-random in [0,1) from a segment's own geometry —
 *  NOT the growth RNG stream (a full rebake must reproduce the exact same
 *  per-segment jitter without depending on draw order). */
function hashJitter(seg: Segment): number {
  const h = Math.sin(seg.x1 * 12.9898 + seg.y1 * 78.233 + seg.depth * 37.719 + seg.seedIdx * 91.7) * 43758.5453
  return h - Math.floor(h)
}

function colorFor(s: GardenState, seg: Segment): string {
  const salt = s.seeds[seg.seedIdx]?.salt ?? 'copper'
  const u = Math.max(0, Math.min(1, seg.dEnd / COLOR_REF_DIST))
  const c = sampleGradientRGBA(SALT_RAMPS[salt].map((x) => x + 'ff'), u)
  return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`
}

function stamp(s: GardenState, buf: RenderBuf, dpr: number, seg: Segment): void {
  const { view, cfg } = s
  const x0 = (view.offsetX + seg.x0 * view.scale) * dpr
  const y0 = (view.offsetY + seg.y0 * view.scale) * dpr
  const x1 = (view.offsetX + seg.x1 * view.scale) * dpr
  const y1 = (view.offsetY + seg.y1 * view.scale) * dpr
  // slight per-burst width irregularity sells the osmotic look
  const widthJitter = 1 + (hashJitter(seg) - 0.5) * 0.25
  const width = Math.max(1, cfg.lineWidth * Math.pow(cfg.taper, seg.depth) * widthJitter) * dpr
  buf.bctx.strokeStyle = colorFor(s, seg)
  buf.bctx.lineWidth = width
  buf.bctx.lineCap = 'round'
  buf.bctx.lineJoin = 'round'
  buf.bctx.beginPath()
  buf.bctx.moveTo(x0, y0)
  buf.bctx.lineTo(x1, y1)
  buf.bctx.stroke()
}

export function render(s: GardenState, ctx: CanvasRenderingContext2D): void {
  const buf = ensureBuf(s, ctx)
  const dpr = s.w > 0 ? ctx.canvas.width / s.w : 1
  let changed = false

  if (s.needsFullRedraw) {
    buf.bctx.clearRect(0, 0, buf.w, buf.h)
    for (const seg of s.bakedSegments) stamp(s, buf, dpr, seg)
    s.needsFullRedraw = false
    s.fresh.length = 0
    changed = true
  } else if (s.fresh.length) {
    for (const seg of s.fresh) stamp(s, buf, dpr, seg)
    s.fresh.length = 0
    changed = true
  }

  // background composited live (never baked) so a palette/bg edit shows instantly
  ctx.fillStyle = s.cfg.background
  ctx.fillRect(0, 0, s.w, s.h)

  const alpha = fadeAlpha(s)
  if (alpha <= 0 || s.bakedSegments.length === 0) return

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0) // draw the buffers 1:1 in device px
  if (s.cfg.glow > 0) {
    const bloomSig = `${s.cfg.glow}|${dpr}`
    if (changed || bloomSig !== buf.bloomSig) {
      buf.bloomCtx.clearRect(0, 0, buf.w, buf.h)
      buf.bloomCtx.filter = `blur(${(s.cfg.glow * 7 + 1) * dpr}px)`
      buf.bloomCtx.drawImage(buf.canvas, 0, 0)
      buf.bloomCtx.filter = 'none'
      buf.bloomSig = bloomSig
    }
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = alpha * (0.3 + s.cfg.glow * 0.4)
    ctx.drawImage(buf.bloom, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.globalAlpha = alpha
  ctx.drawImage(buf.canvas, 0, 0)
  ctx.restore()
  ctx.globalAlpha = 1
}

/** Free the buffers for a state (teardown). */
export function disposeRender(s: GardenState): void {
  bufs.delete(s)
}
