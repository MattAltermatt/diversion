import type { AbstractileConfig } from './schema'
import type { FundGroup, Mosaic } from './mosaic'
import { buildMosaic } from './mosaic'

// Tiles are baked into an offscreen accumulation buffer (device px) so laying and
// dissolving are cheap — only newly-crossed cells touch the buffer each frame.
// The background/grout is composited LIVE under the buffer, so editing it (and the
// grout gaps) updates instantly without a rebuild.

interface Buf {
  canvas: HTMLCanvasElement
  bctx: CanvasRenderingContext2D
  w: number // device px
  h: number
}

export interface AbstractileState {
  cfg: AbstractileConfig
  w: number // CSS px
  h: number
  mosaic: Mosaic
  buf: Buf | null
  dpr: number
  laid: number
  cleared: number
  t: number
  dirty: boolean // buffer must be cleared + re-laid from scratch
}

// ── timing (derived per frame; cheap, keeps fillSpeed/hold edits live) ──
function timing(m: Mosaic, cfg: AbstractileConfig) {
  const nFund = m.layOrder.length
  const fillDur = Math.min(16, Math.max(2.5, nFund / cfg.fillSpeed))
  const holdEnd = fillDur + cfg.holdSeconds
  const dissolveDur = Math.min(10, Math.max(1.5, nFund / (cfg.fillSpeed * 1.5)))
  return { nFund, fillDur, holdEnd, dissolveDur, end: holdEnd + dissolveDur }
}

/** Seconds the current mosaic runs end to end (fill + hold + dissolve). */
export function cycleEnd(s: AbstractileState): number {
  return timing(s.mosaic, s.cfg).end
}

// ── canonical tile shapes, drawn in local coords centred at the origin ──
// Local cell spans [-h, h]; the symmetry/orientation matrix is already applied to
// the context, so each shape only needs its canonical form. colB === null means an
// open (background) ground.
function drawCanon(g: CanvasRenderingContext2D, family: number, h: number, colA: string, colB: string | null): void {
  const s = 2 * h
  switch (family) {
    case 0: // Triangles — half-square split along the TL→BR diagonal
      g.fillStyle = colB ?? colA
      g.beginPath(); g.moveTo(-h, -h); g.lineTo(-h, h); g.lineTo(h, h); g.closePath(); g.fill()
      g.fillStyle = colA
      g.beginPath(); g.moveTo(-h, -h); g.lineTo(h, -h); g.lineTo(h, h); g.closePath(); g.fill()
      break
    case 1: // Arcs — Truchet quarter-circles at two opposite corners
      if (colB) { g.fillStyle = colB; g.fillRect(-h, -h, s, s) }
      g.fillStyle = colA
      g.beginPath(); g.moveTo(-h, -h); g.arc(-h, -h, h, 0, Math.PI / 2); g.closePath(); g.fill()
      g.beginPath(); g.moveTo(h, h); g.arc(h, h, h, Math.PI, Math.PI * 1.5); g.closePath(); g.fill()
      break
    case 2: // Quarters — one big corner quarter-disk (four meet into a full circle)
      if (colB) { g.fillStyle = colB; g.fillRect(-h, -h, s, s) }
      g.fillStyle = colA
      g.beginPath(); g.moveTo(-h, -h); g.arc(-h, -h, s, 0, Math.PI / 2); g.closePath(); g.fill()
      break
    case 3: // Diamonds — a corner triangle (four cells → octagon-and-diamond lattice)
      if (colB) { g.fillStyle = colB; g.fillRect(-h, -h, s, s) }
      g.fillStyle = colA
      g.beginPath(); g.moveTo(h, h); g.lineTo(0, h); g.lineTo(h, 0); g.closePath(); g.fill()
      break
    default: // Bars — a centred bar (H/V neighbours weave a basket lattice)
      if (colB) { g.fillStyle = colB; g.fillRect(-h, -h, s, s) }
      g.fillStyle = colA
      g.fillRect(-h / 2, -h, h, s)
      break
  }
}

function drawFund(g: CanvasRenderingContext2D, group: FundGroup, palette: string[], bg: string, cell: number, grout: number): void {
  const h = Math.max(1, (cell - grout) / 2)
  for (const d of group.draws) {
    const colA = d.ca < 0 ? bg : palette[d.ca] ?? bg
    const colB = d.cb < 0 ? null : palette[d.cb] ?? bg
    g.save()
    g.translate(d.cx + cell / 2, d.cy + cell / 2)
    g.transform(d.mat.a, d.mat.b, d.mat.c, d.mat.d, 0, 0)
    drawCanon(g, d.family, h, colA, colB)
    g.restore()
  }
}

function clearFund(g: CanvasRenderingContext2D, group: FundGroup, cell: number): void {
  for (const d of group.draws) g.clearRect(d.cx - 0.5, d.cy - 0.5, cell + 1, cell + 1)
}

function ensureBuf(s: AbstractileState, ctx: CanvasRenderingContext2D): Buf {
  const cw = ctx.canvas.width
  const ch = ctx.canvas.height
  let buf = s.buf
  if (!buf || buf.w !== cw || buf.h !== ch) {
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    buf = { canvas, bctx: canvas.getContext('2d')!, w: cw, h: ch }
    s.buf = buf
    s.dpr = cw / Math.max(1, s.w)
    s.dirty = true
  }
  return buf
}

/** Draw one frame: catch the buffer up to the current lay/dissolve progress, then
 *  composite background (live) + the baked buffer onto the main context. */
export function render(s: AbstractileState, ctx: CanvasRenderingContext2D): void {
  const buf = ensureBuf(s, ctx)
  const g = buf.bctx
  const { nFund, fillDur, holdEnd, dissolveDur } = timing(s.mosaic, s.cfg)

  if (s.dirty) {
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, buf.w, buf.h)
    g.setTransform(s.dpr, 0, 0, s.dpr, 0, 0) // draw the mosaic in CSS px
    s.laid = 0
    s.cleared = 0
    s.dirty = false
  }

  const palette = s.cfg.palette
  const bg = s.cfg.background
  const cell = s.mosaic.cell
  const grout = s.cfg.grout

  // lay tiles up to the fill fraction
  const targetLaid = Math.min(nFund, Math.max(0, Math.floor((s.t / fillDur) * nFund)))
  while (s.laid < targetLaid) {
    drawFund(g, s.mosaic.layOrder[s.laid], palette, bg, cell, grout)
    s.laid++
  }

  // dissolve tiles up to the dissolve fraction (after fill + hold)
  const dp = (s.t - holdEnd) / dissolveDur
  const targetCleared = dp <= 0 ? 0 : Math.min(nFund, Math.floor(dp * nFund))
  while (s.cleared < targetCleared) {
    clearFund(g, s.mosaic.layOrder[s.mosaic.dissolveOrder[s.cleared]], cell)
    s.cleared++
  }

  // ── composite: live background, then the baked buffer at 1:1 device px ──
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, s.w, s.h)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(buf.canvas, 0, 0)
  ctx.restore()
}

// ── lifecycle helpers ──

export function createState(cfg: AbstractileConfig, w: number, h: number): AbstractileState {
  return {
    cfg, w, h,
    mosaic: buildMosaic(cfg, w, h),
    buf: null, dpr: 1, laid: 0, cleared: 0, t: 0, dirty: true,
  }
}

/** Rebuild the mosaic in place (resize, or a structural / colour config edit).
 *  Marks the buffer dirty so the next render re-lays from the current clock. */
export function rebuild(s: AbstractileState, resetClock: boolean): void {
  s.mosaic = buildMosaic(s.cfg, s.w, s.h)
  s.dirty = true
  if (resetClock) s.t = 0
}
