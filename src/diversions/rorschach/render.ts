import type { Mark, RorschachState } from './rorschach'

// ─── Rendering ───────────────────────────────────────────────────────────────
// Ink dots are baked ONCE onto a persistent accumulation buffer (device px), so the
// blot is never re-drawn dot-by-dot every frame — only the dots deposited since the
// last frame are stamped. A reseed clears the buffer; an appearance edit (ink colour,
// softness, two-tone) rebakes every mark from the stored mark list. The BACKGROUND is
// composited live each frame (so a background edit shows instantly), and the fade is a
// live global-alpha on the buffer — the baked ink is never re-touched to dissolve.
// Each dot is a radial gradient: a solid core out to `core`, fading to transparent at
// the rim (edge softness). Two-tone draws a wider, low-alpha accent disc beneath, so a
// ring of accent peeks around the ink.

interface RenderBuf {
  canvas: HTMLCanvasElement
  bctx: CanvasRenderingContext2D
  w: number
  h: number
}
const bufs = new WeakMap<RorschachState, RenderBuf>()

function stamp(s: RorschachState, bctx: CanvasRenderingContext2D, dpr: number, m: Mark): void {
  const x = m.x * dpr
  const y = m.y * dpr
  const r = m.r * dpr
  const ink = s.cfg.blotColor
  const core = Math.max(0.02, 1 - s.cfg.edgeSoftness * 0.7)

  if (s.cfg.twoTone) {
    const ar = r * 1.45
    const ga = bctx.createRadialGradient(x, y, 0, x, y, ar)
    ga.addColorStop(0, s.cfg.accentColor)
    ga.addColorStop(core * 0.9, s.cfg.accentColor)
    ga.addColorStop(1, s.cfg.accentColor + '00')
    bctx.globalAlpha = 0.5
    bctx.fillStyle = ga
    bctx.beginPath()
    bctx.arc(x, y, ar, 0, Math.PI * 2)
    bctx.fill()
    bctx.globalAlpha = 1
  }

  const g = bctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, ink)
  g.addColorStop(core, ink)
  g.addColorStop(1, ink + '00')
  bctx.fillStyle = g
  bctx.beginPath()
  bctx.arc(x, y, r, 0, Math.PI * 2)
  bctx.fill()
}

function ensureBuf(s: RorschachState, ctx: CanvasRenderingContext2D): RenderBuf {
  const cw = ctx.canvas.width
  const ch = ctx.canvas.height
  let buf = bufs.get(s)
  if (!buf || buf.w !== cw || buf.h !== ch) {
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    buf = { canvas, bctx: canvas.getContext('2d')!, w: cw, h: ch }
    bufs.set(s, buf)
    s.needsFullRedraw = true
  }
  return buf
}

export function render(s: RorschachState, ctx: CanvasRenderingContext2D): void {
  const buf = ensureBuf(s, ctx)
  const dpr = ctx.canvas.width / s.w

  if (s.needsClear) {
    buf.bctx.clearRect(0, 0, buf.w, buf.h)
    s.needsClear = false
    s.needsFullRedraw = false
    s.fresh.length = 0
    for (const m of s.marks) stamp(s, buf.bctx, dpr, m) // usually empty right after reseed
  } else if (s.needsFullRedraw) {
    buf.bctx.clearRect(0, 0, buf.w, buf.h)
    for (const m of s.marks) stamp(s, buf.bctx, dpr, m)
    s.needsFullRedraw = false
    s.fresh.length = 0
  } else if (s.fresh.length) {
    for (const m of s.fresh) stamp(s, buf.bctx, dpr, m)
    s.fresh.length = 0
  }

  // composite: paper live, then the baked ink at the current fade opacity, 1:1 in
  // device px (the buffer is already device-sized).
  ctx.fillStyle = s.cfg.background
  ctx.fillRect(0, 0, s.w, s.h)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = s.alpha
  ctx.drawImage(buf.canvas, 0, 0)
  ctx.globalAlpha = 1
  ctx.restore()
}

/** Free the buffer for a state (teardown). */
export function disposeRender(s: RorschachState): void {
  bufs.delete(s)
}
