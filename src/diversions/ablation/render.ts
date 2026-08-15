import { parseHex6, parseHex8, rgba, type RGB } from '../../framework/color'
import { trackPoint, type Turret } from './turrets'
import type { AblationState } from './ablation'

// Everything that touches the canvas. The picture itself lives in a persistent
// offscreen buffer patched only where cells die — at cell size 16 that saves
// little, but at cell size 2 there are a quarter-million cells and redrawing them
// every frame is the difference between shippable and not.

const DYING_S = 0.26
const BOLT_S = 0.11

/** Palette entries reach here as whatever the colorList control emitted: #rgb,
 *  #rrggbb, or #rrggbbaa (an alpha stop). Parse all three — a NaN channel poisons
 *  every rgba() string built from it and silently renders nothing. */
function toRgb(hex: string): RGB {
  if (hex.length === 9) return parseHex8(hex)
  if (hex.length === 4) {
    const [r, g, b] = [hex[1], hex[2], hex[3]]
    return parseHex6(`#${r}${r}${g}${g}${b}${b}`)
  }
  return parseHex6(hex)
}

interface Palette {
  key: string[]
  bands: RGB[]
  /** opaque `rgba(...)` per band, built once — the varying alpha rides globalAlpha */
  css: string[]
  background: string
}

/** Derived draw state, per running instance rather than per module: a module-level
 *  singleton is thrashed every frame by two concurrent hosts with different
 *  palettes (the config screen's live preview beside a gallery tile, or a
 *  StrictMode double-mount). */
interface Derived {
  palette: Palette
  /** device-pixel ratio the current buffer was rasterised at */
  dpr: number
  /** an offscreen 2D context was refused — stop asking every frame */
  failed: boolean
}

const derived = new WeakMap<AblationState, Derived>()

function palette(s: AblationState): Palette {
  const d = derived.get(s)
  if (d && d.palette.key === s.cfg.palette && d.palette.background === s.cfg.background) return d.palette
  const bands = s.cfg.palette.map(toRgb)
  const p: Palette = {
    key: s.cfg.palette,
    bands,
    css: bands.map((c) => rgba(c, 1)),
    background: s.cfg.background,
  }
  derived.set(s, { palette: p, dpr: d?.dpr ?? 1, failed: false })
  return p
}

function bandCss(p: Palette, band: number): string {
  return p.css[band] ?? p.css[p.css.length - 1] ?? 'rgba(255,255,255,1)'
}

/** The picture buffer holds ONLY living cells, transparent elsewhere, so blitting
 *  it over the background needs no per-cell background fill. */
function syncBuffer(s: AblationState, p: Palette, dpr: number): HTMLCanvasElement | null {
  const { geom, field } = s
  const d = derived.get(s)
  if (d?.failed) return null

  if (!s.buffer || (d && d.dpr !== dpr)) {
    const canvas = document.createElement('canvas')
    // Backing store at device resolution, drawn in CSS px via setTransform — the
    // project HiDPI convention. Sized in CSS px, a 2px cell becomes a bilinear
    // smear at dpr 2 while the dying cell drawn over it stays device-crisp.
    canvas.width = Math.max(1, Math.round(geom.pw * dpr))
    canvas.height = Math.max(1, Math.round(geom.ph * dpr))
    const bctx = canvas.getContext('2d')
    if (!bctx) {
      // Cache the refusal. Retrying every frame allocates a detached canvas per
      // frame forever — the gallery has hit context exhaustion before.
      if (d) d.failed = true
      else derived.set(s, { palette: p, dpr, failed: true })
      return null
    }
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    bctx.globalAlpha = 1
    bctx.clearRect(0, 0, geom.pw, geom.ph)

    // Run-length along each row rather than a rect per cell. Contour bands are
    // wide, so this collapses ~130 fills per row into a handful — and, more
    // importantly, one CSS-colour string parse per RUN instead of per cell. At
    // cell size 2 the per-cell version is a quarter-million parses.
    for (let row = 0; row < field.rows; row++) {
      let runStart = 0
      let runBand = -1
      for (let col = 0; col <= field.cols; col++) {
        const cell = row * field.cols + col
        const band = col < field.cols && field.alive[cell] === 1 ? field.idx[cell] : -1
        if (band === runBand) continue
        if (runBand >= 0) {
          bctx.fillStyle = bandCss(p, runBand)
          bctx.fillRect(runStart * geom.cell, row * geom.cell, (col - runStart) * geom.cell, geom.cell)
        }
        runBand = band
        runStart = col
      }
    }
    s.buffer = canvas
    s.patches.length = 0
    if (d) d.dpr = dpr
    else derived.set(s, { palette: p, dpr, failed: false })
    return canvas
  }

  const bctx = s.buffer.getContext('2d')
  if (!bctx) return s.buffer
  for (const cell of s.patches) {
    const col = cell % field.cols
    const row = (cell - col) / field.cols
    bctx.clearRect(col * geom.cell, row * geom.cell, geom.cell, geom.cell)
  }
  s.patches.length = 0
  return s.buffer
}

export function render(s: AblationState, ctx: CanvasRenderingContext2D): void {
  const p = palette(s)
  const { geom } = s
  const w = s.size.width
  const h = s.size.height

  // 1. Ground.
  ctx.globalAlpha = 1
  ctx.fillStyle = p.background
  ctx.fillRect(0, 0, w, h)

  // 2 + 3. The picture. The host has already applied a setTransform(dpr,…), so the
  // canvas backing store is `w * dpr` wide while we draw in CSS px — recover the
  // ratio from that rather than reading devicePixelRatio, which can disagree.
  const dpr = Math.max(1, Math.min(4, ctx.canvas.width / Math.max(1, w) || 1))
  const buffer = syncBuffer(s, p, dpr)
  if (buffer) {
    ctx.globalAlpha = 1
    ctx.drawImage(buffer, geom.px, geom.py, geom.pw, geom.ph)
  }

  // 4. Cells mid-death: shrinking toward their own centre while draining out.
  for (const d of s.dying) {
    const k = 1 - d.t / DYING_S
    const size = geom.cell * k
    const inset = (geom.cell - size) / 2
    ctx.globalAlpha = k * k
    ctx.fillStyle = bandCss(p, d.band)
    ctx.fillRect(geom.px + d.col * geom.cell + inset, geom.py + d.row * geom.cell + inset, size, size)
  }

  // 5. The track.
  const tx = geom.px - geom.gap
  const ty = geom.py - geom.gap
  ctx.globalAlpha = 1
  ctx.lineWidth = 1
  ctx.strokeStyle = rgba({ r: 120, g: 140, b: 165 }, 0.22)
  ctx.strokeRect(tx + 0.5, ty + 0.5, geom.seg[0] - 1, geom.seg[1] - 1)

  // 6. Turrets: drawn in the colour they hunt, brightness = charge remaining.
  for (const l of s.track) {
    const pt = trackPoint(geom, l.s)
    const intensity = Math.max(0, Math.min(1, l.charge / l.maxCharge))
    const css = bandCss(p, l.band)
    // Sized off the TRACK, not the cell: a turret is a thing riding the track, and
    // tying it to cell size makes it vanish at cell 2 and bloat at cell 40.
    const along = Math.max(7, geom.gap * 0.62)
    const across = Math.max(3, geom.gap * 0.3)
    // Long axis follows travel: horizontal on the top/bottom edges, vertical on
    // the left/right ones. pt.dx is non-zero exactly on the vertical edges.
    const bw = pt.dx === 0 ? along : across
    const bh = pt.dx === 0 ? across : along

    ctx.globalAlpha = 0.18 + 0.62 * intensity
    ctx.fillStyle = css
    ctx.fillRect(pt.x - bw / 2, pt.y - bh / 2, bw, bh)

    // A hot core so a fresh turret reads as blazing rather than merely opaque.
    const core = 0.45 + 0.55 * intensity
    ctx.globalAlpha = 0.25 + 0.75 * intensity
    ctx.fillStyle = css
    ctx.fillRect(pt.x - (bw * core) / 2, pt.y - (bh * core) / 2, bw * core, bh * core)
  }

  // 7. Bolts — the only beam ever drawn. A miss makes no light at all, so a strike
  //    reads as an event.
  ctx.lineCap = 'round'
  for (const b of s.bolts) {
    const k = 1 - b.t / BOLT_S
    ctx.globalAlpha = k * (0.35 + 0.65 * b.intensity)
    ctx.lineWidth = 1 + 1.6 * k
    ctx.strokeStyle = bandCss(p, b.band)
    ctx.beginPath()
    ctx.moveTo(b.x0, b.y0)
    ctx.lineTo(b.x1, b.y1)
    ctx.stroke()
  }

  // 8. The two rows of turrets that are NOT riding, drawn just OUTSIDE the track so
  //    they read as parked rather than riding. Undrawn they would be invisible state
  //    (UX invariant #2) — and the colour mix in each row is a readout: what is about
  //    to happen to the picture on one side, what is already finished on the other.
  const outward = Math.max(4, geom.gap * 0.55)
  // Each row owns at most a quarter of the perimeter. Pitch is otherwise fixed, so a
  // large fleet on a small viewport runs one row straight through the other's anchor
  // — at 128 turrets and a 640x480 window the pending row alone wants 70% of the
  // track. Shrinking the pitch keeps both rows inside their own quadrant.
  const rowBudget = geom.perimeter / 4
  const longest = Math.max(s.queue.length, s.retired.length, 1)
  const spacing = Math.min(Math.max(6, geom.gap * 0.5), rowBudget / longest)
  const dot = Math.max(2, spacing * 0.32)
  //   The two rows are told apart by SIZE, not by alpha. Dimming was the obvious
  //   choice and is the wrong one on these palettes: composited over the ground at
  //   alpha 0.3 the darker half of every ramp lands at 1.12-1.5 WCAG, under the 1.88
  //   floor the palettes are built to hold, so a retired dot of a dark band is not
  //   visible at all — and retirement fills from the dark bands first, making the row
  //   most invisible exactly when it carries the most information (invariants #2,
  //   #5). Reaching 1.88 on the darkest stop needs alpha 0.82-1.00 depending on the
  //   palette, so alpha simply cannot carry a "dimmer" signal here. Both rows draw
  //   opaque; retired draws smaller.
  const parkedRow = (turrets: Turret[], anchor: number, scale: number) => {
    const r = Math.max(1.5, dot * scale)
    for (let i = 0; i < turrets.length; i++) {
      // Walk BACKWARDS along the track from the anchor, so the row trails away from
      // it rather than running into the turrets that are riding.
      const pt = trackPoint(geom, anchor - (i + 1) * spacing)
      const qx = Math.max(r, Math.min(w - r, pt.x - pt.dx * outward))
      const qy = Math.max(r, Math.min(h - r, pt.y - pt.dy * outward))
      ctx.globalAlpha = 1
      ctx.fillStyle = bandCss(p, turrets[i].band)
      ctx.beginPath()
      ctx.arc(qx, qy, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // Pending trails back from the gate at the top-left corner; retired trails back
  // from `perimeter / 2`, which lands exactly on the bottom-right corner — the two
  // readouts sit diagonally opposite and never crowd each other.
  parkedRow(s.queue, 0, 1)
  parkedRow(s.retired, geom.perimeter / 2, 0.55)

  ctx.globalAlpha = 1
}
