import { hexToRgb } from '../../framework/color'
import type { SalvageState, Drone, Crew } from './state'
import { BLANK, GLYPH_MIN_PX } from './state'
import { decayFine } from './trails'

const BLANK_TINT = '#5a5a62'

/** Per-state render caches: two offscreen layers (picture, mound) patched only when a
 *  piece moves, and an ImageData for the trails. Created lazily by the renderer, never
 *  by the sim; where no offscreen 2D context exists (jsdom) we draw pieces directly. */
interface Layers {
  picture: HTMLCanvasElement | null
  mound: HTMLCanvasElement | null
  trail: HTMLCanvasElement | null
  trailData: ImageData | null
  /** Wall-clock ms of the last trail raster (display cadence only — the sim never sees it). */
  trailAt: number
  width: number
  height: number
  cell: number
  failed: boolean
}
const layers = new WeakMap<SalvageState, Layers>()

function rgb(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex)
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = Math.max(1, w); c.height = Math.max(1, h)
  return c.getContext('2d') ? c : null
}

/** Layers are re-allocated only when the canvas geometry changes. A palette or
 *  ground change is a REPAINT (the sim sets `dirty = [-1]`), never a reallocation —
 *  a colour-picker drag runs per input event, and two full-size canvases per event
 *  is exactly the kind of churn a drag turns into a stutter. */
function getLayers(s: SalvageState): Layers {
  let L = layers.get(s)
  if (!L || L.width !== s.size.width || L.height !== s.size.height || L.cell !== s.cell) {
    // Cache a refusal: retrying every frame would allocate a detached canvas per frame.
    const failed = L?.failed ?? false
    L = { picture: null, mound: null, trail: null, trailData: null, trailAt: -Infinity, width: s.size.width,
          height: s.size.height, cell: s.cell, failed }
    if (!failed) {
      L.picture = makeCanvas(s.size.width, s.size.height)
      L.mound = makeCanvas(s.size.width, s.size.height)
      // The trail layer is the FINE field's size (#318): ~2.5 px per fine cell, so a
      // trail draws as a thin line along the path walked, not a cell-wide stripe.
      L.trail = makeCanvas(s.trails.fcols, s.trails.frows)
      if (!L.picture || !L.mound || !L.trail) { L.failed = true; L.picture = L.mound = L.trail = null }
      else L.trailData = L.trail.getContext('2d')!.createImageData(s.trails.fcols, s.trails.frows)
    }
    layers.set(s, L)
    s.dirty = [-1]
  }
  return L
}

export function render(s: SalvageState, ctx: CanvasRenderingContext2D): void {
  const cs = s.cell
  const W = s.size.width, H = s.size.height
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.fillStyle = s.cfg.background
  ctx.fillRect(0, 0, W, H)
  if (!s.hasPicture) { drawDrones(s, ctx, cs); return }
  const L = getLayers(s)
  drawTrails(s, ctx, L)
  if (L.failed) drawPiecesDirect(s, ctx, cs)
  else { syncLayers(s, L, cs); blitLayers(s, ctx, L) }
  for (const crew of s.crews) if (crew.moving) drawLifted(s, ctx, crew, cs)
  drawDrones(s, ctx, cs)
  ctx.globalAlpha = 1
}

/** The fine field is re-rasterised at most every TRAIL_RASTER_MS (~30 Hz) and the
 *  canvas from the last raster is blitted in between. The glow moves on a seconds-scale
 *  half-life and the tip lags a drone by at most 0.1 cell, so the cadence is invisible —
 *  while a per-frame raster of a viewport-sized field was 1.6 ms at 1080p and 6.6 ms at
 *  4K before the upload (measured). Display only: `decayFine` settles exactly the time
 *  the sim banked, so the drawn strength is what a per-frame decay would have produced. */
const TRAIL_RASTER_MS = 33
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function drawTrails(s: SalvageState, ctx: CanvasRenderingContext2D, L: Layers): void {
  const glow = s.cfg.trailGlow
  if (glow <= 0 || !L.trail || !L.trailData) return
  const t = s.trails
  // A rebuilt arena (a resize moved the cell) resizes the fine field under a cached layer.
  if (L.trail.width !== t.fcols || L.trail.height !== t.frows) {
    L.trail.width = Math.max(1, t.fcols); L.trail.height = Math.max(1, t.frows)
    L.trailData = L.trail.getContext('2d')!.createImageData(t.fcols, t.frows)
    L.trailAt = -Infinity
  }
  const tick = now()
  if (tick - L.trailAt >= TRAIL_RASTER_MS) {
    L.trailAt = tick
    decayFine(t, s.cfg.trailFade)
    const data = L.trailData.data
    const pal = s.palette.map(rgb)
    for (let i = 0, p = 0; i < t.fstrength.length; i++, p += 4) {
      const v = t.fstrength[i]
      const k = t.fcolor[i]
      if (v < 0.01 || k < 0 || k >= pal.length) { data[p + 3] = 0; continue }
      const c = pal[k]
      data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2]
      data[p + 3] = Math.min(255, Math.round(255 * glow * Math.sqrt(v) * 0.7))
    }
    L.trail.getContext('2d')!.putImageData(L.trailData, 0, 0)
  }
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 1
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(L.trail, 0, 0, t.fcols, t.frows, 0, 0, s.cols * s.cell, s.rows * s.cell)
  ctx.globalCompositeOperation = 'source-over'
}

/** Paint one piece (cells + seams) onto a layer context, or clear its cells. */
function paintPiece(s: SalvageState, lctx: CanvasRenderingContext2D, id: number, cs: number, erase: boolean, cells: Int32Array): void {
  const g = s.grid
  const seam = `rgba(${rgb(s.cfg.background).join(',')},0.6)`
  const colour = s.palette[s.chunks[id].color]
  for (const i of cells) {
    const col = i % g.cols, row = (i - col) / g.cols
    const x = col * cs, y = row * cs
    if (erase) { lctx.clearRect(x, y, cs, cs); continue }
    lctx.fillStyle = colour
    lctx.fillRect(x, y, cs, cs)
    lctx.fillStyle = seam
    if (col + 1 >= g.cols || g.owner[i + 1] !== id) lctx.fillRect(x + cs - 1, y, 1, cs)
    if (row + 1 >= g.rows || g.owner[i + g.cols] !== id) lctx.fillRect(x, y + cs - 1, cs, 1)
    if (col === 0 || g.owner[i - 1] !== id) lctx.fillRect(x, y, 1, cs)
    if (row === 0 || g.owner[i - g.cols] !== id) lctx.fillRect(x, y, cs, 1)
  }
}

/** Bring the two layers up to date with the sim's dirty list. A piece is on exactly
 *  one layer or lifted; -1 means repaint everything (a new picture, a palette change). */
function syncLayers(s: SalvageState, L: Layers, cs: number): void {
  if (s.dirty.length === 0) return
  const pctx = L.picture!.getContext('2d')!, mctx = L.mound!.getContext('2d')!
  pctx.globalAlpha = 1; mctx.globalAlpha = 1
  if (s.dirty.includes(-1)) {
    pctx.clearRect(0, 0, L.width, L.height); mctx.clearRect(0, 0, L.width, L.height)
    for (const c of s.chunks) {
      if (c.where === 'picture') paintPiece(s, pctx, c.id, cs, false, c.at!)
      else if (c.where === 'mound') paintPiece(s, mctx, c.id, cs, false, c.at!)
    }
  } else {
    for (const id of s.dirty) {
      const c = s.chunks[id]
      if (!c) continue
      // Lifted: erase from the picture layer. Landed: paint on the mound layer.
      paintPiece(s, pctx, id, cs, true, c.home)
      if (c.where === 'mound') paintPiece(s, mctx, id, cs, false, c.at!)
    }
  }
  s.dirty.length = 0
}

function blitLayers(s: SalvageState, ctx: CanvasRenderingContext2D, L: Layers): void {
  if (s.moundAlpha > 0) { ctx.globalAlpha = s.moundAlpha; ctx.drawImage(L.mound!, 0, 0) }
  if (s.pictureAlpha > 0) { ctx.globalAlpha = s.pictureAlpha; ctx.drawImage(L.picture!, 0, 0) }
  ctx.globalAlpha = 1
}

/** jsdom fallback: no offscreen canvas, so paint placed pieces straight to the canvas. */
function drawPiecesDirect(s: SalvageState, ctx: CanvasRenderingContext2D, cs: number): void {
  for (const c of s.chunks) {
    if (!c.at) continue
    ctx.globalAlpha = c.where === 'mound' ? s.moundAlpha : s.pictureAlpha
    if (ctx.globalAlpha <= 0) continue
    paintPiece(s, ctx, c.id, cs, false, c.at)
  }
  ctx.globalAlpha = 1
}

function drawLifted(s: SalvageState, ctx: CanvasRenderingContext2D, crew: Crew, cs: number): void {
  const c = crew.chunk
  const bob = Math.sin(s.time * 2.2 + c.id) * 0.25 * cs
  ctx.globalAlpha = 0.25
  ctx.fillStyle = '#000000'
  for (let k = 0; k < c.local.length / 2; k++) {
    ctx.fillRect((crew.x + c.local[k * 2]) * cs + 2, (crew.y + c.local[k * 2 + 1]) * cs + bob + 2, cs, cs)
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = s.palette[c.color]
  for (let k = 0; k < c.local.length / 2; k++) {
    ctx.fillRect((crew.x + c.local[k * 2]) * cs, (crew.y + c.local[k * 2 + 1]) * cs + bob, cs, cs)
  }
}

function drawDrones(s: SalvageState, ctx: CanvasRenderingContext2D, cs: number): void {
  const glyph = s.cfg.glyph
  // The glyph is a picture of a point: `g` scales the drawing, `cs` still places it —
  // and never below GLYPH_MIN_PX, or a phone's 4 px cell draws a sub-pixel drone.
  const g = Math.max(GLYPH_MIN_PX, cs * s.cfg.droneSize)
  ctx.lineWidth = Math.max(1, g * 0.08)
  ctx.lineCap = 'round'
  for (const d of s.drones) {
    const colour = d.tint === BLANK || d.tint >= s.palette.length ? BLANK_TINT : s.palette[d.tint]
    ctx.globalAlpha = d.state === 'latched' ? 0.8 + 0.2 * Math.sin(s.time * Math.PI * 3 + d.legPhase) : 1
    ctx.fillStyle = colour
    ctx.strokeStyle = colour
    const x = d.x * cs, y = d.y * cs
    if (glyph === 'Dot') { dot(ctx, x, y, d.heading, g); continue }
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(d.heading)
    if (glyph === 'Spider') spider(ctx, d, g)
    else ant(ctx, d, g)
    ctx.restore()
  }
  ctx.globalAlpha = 1
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, cs: number): void {
  ctx.beginPath(); ctx.arc(x, y, cs * 0.35, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(h) * cs * 0.6, y + Math.sin(h) * cs * 0.6); ctx.stroke()
}

const SIDES = [1, -1] as const

/** Body plus eight two-segment legs, ONE path and ONE stroke per drone. */
function spider(ctx: CanvasRenderingContext2D, d: Drone, cs: number): void {
  const moving = d.state !== 'latched'
  ctx.beginPath(); ctx.ellipse(0, 0, cs * 0.45, cs * 0.3, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath()
  for (let i = 0; i < 4; i++) {
    const a = 0.45 + i * 0.38
    const swing = moving ? Math.sin(d.legPhase * 3 + i * 1.7) * 0.25 : 0
    for (const side of SIDES) {
      const ang = side * (a + swing * side)
      const kx = Math.cos(ang) * cs * 0.55, ky = Math.sin(ang) * cs * 0.55
      const fx = kx + Math.cos(ang + side * 0.6) * cs * 0.4, fy = ky + Math.sin(ang + side * 0.6) * cs * 0.4
      ctx.moveTo(0, 0); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy)
    }
  }
  ctx.stroke()
}

function ant(ctx: CanvasRenderingContext2D, d: Drone, cs: number): void {
  const moving = d.state !== 'latched'
  ctx.beginPath()
  for (const [ox, r] of [[0.35, 0.18], [0, 0.15], [-0.4, 0.24]] as const) {
    ctx.moveTo(ox * cs + r * cs, 0); ctx.arc(ox * cs, 0, r * cs, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.beginPath()
  for (let i = 0; i < 3; i++) {
    const a = 0.6 + i * 0.6
    const swing = moving ? Math.sin(d.legPhase * 3 + i * 2.1) * 0.3 : 0
    for (const side of SIDES) {
      const ang = side * (a + swing)
      ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * cs * 0.6, Math.sin(ang) * cs * 0.6)
    }
  }
  ctx.stroke()
}
