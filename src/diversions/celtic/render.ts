import type { CelticConfig } from './schema'
import type { Band, KnotGeometry } from './knot'

// ─── Rendering the interlaced knot ────────────────────────────────────────────
//
// Three co-operating tricks make the weave read as a true over/under interlace:
//   1. Each band is a wide dark GAP stroke (background colour) with a narrower
//      bright CORE stroke on top — so wherever two bands sit close they are
//      separated by a dark channel.
//   2. Continuous ribbons are drawn band-by-band (all crossings ambiguous).
//   3. An OVER-LIFT pass then, at every real crossing, punches a gap across the
//      under-strand and redraws the over-strand's core on top — lifting the over
//      band above the under band. The over/under choice is the checkerboard
//      parity baked into the geometry, so it is globally consistent.

function bandColor(cfg: CelticConfig, band: Band, total: number): string {
  if (cfg.colorMode === 'rainbow') {
    const hue = total > 0 ? (band.index / total) * 360 : 0
    return `hsl(${hue.toFixed(1)}, 70%, 62%)`
  }
  return cfg.band
}

/** Trace a closed loop as a rounded polyline. `radius` rounds every direction
 *  change (turns); collinear straight passes are unaffected. */
function ribbonPath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], radius: number) {
  const n = pts.length
  if (n < 2) return
  ctx.beginPath()
  for (let k = 0; k < n; k++) {
    const prev = pts[(k - 1 + n) % n]
    const cur = pts[k]
    const next = pts[(k + 1) % n]
    const inX = cur.x - prev.x
    const inY = cur.y - prev.y
    const outX = next.x - cur.x
    const outY = next.y - cur.y
    const inLen = Math.hypot(inX, inY) || 1
    const outLen = Math.hypot(outX, outY) || 1
    const r = Math.min(radius, inLen / 2, outLen / 2)
    const aX = cur.x - (inX / inLen) * r
    const aY = cur.y - (inY / inLen) * r
    const bX = cur.x + (outX / outLen) * r
    const bY = cur.y + (outY / outLen) * r
    if (k === 0) ctx.moveTo(aX, aY)
    else ctx.lineTo(aX, aY)
    if (r > 0.01) ctx.quadraticCurveTo(cur.x, cur.y, bX, bY)
    else ctx.lineTo(cur.x, cur.y)
  }
  ctx.closePath()
}

export function renderKnot(
  ctx: CanvasRenderingContext2D,
  geo: KnotGeometry,
  cfg: CelticConfig,
  w: number,
  h: number,
  revealRadius: number, // < maxRadius → clip the blossoming reveal
  alpha: number, // fade-out multiplier (1 = solid)
) {
  // Background is always full-frame (the un-revealed area shows the ground).
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, w, h)

  if (alpha <= 0.001) return

  const bw = cfg.bandWidth
  const gapW = bw + Math.max(3, bw * 0.55) * 2 // dark channel each side
  const radius = cfg.cornerRadius * geo.spacing * 0.7
  const total = geo.bands.length

  const clipped = revealRadius < geo.maxRadius
  ctx.save()
  if (clipped) {
    ctx.beginPath()
    ctx.arc(geo.centerX, geo.centerY, Math.max(0, revealRadius), 0, Math.PI * 2)
    ctx.clip()
  }
  ctx.globalAlpha = alpha
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // ── Pass 1: soft glow halo (optional) ──────────────────────────────────────
  if (cfg.glow > 0.001) {
    ctx.globalAlpha = alpha * cfg.glow * 0.4
    ctx.lineWidth = bw * 2.4
    for (const band of geo.bands) {
      ctx.strokeStyle = bandColor(cfg, band, total)
      ribbonPath(ctx, band.pts, radius)
      ctx.stroke()
    }
    ctx.globalAlpha = alpha
  }

  // ── Pass 2: continuous ribbons — dark gap then bright core, band by band ────
  for (const band of geo.bands) {
    ribbonPath(ctx, band.pts, radius)
    ctx.strokeStyle = cfg.background
    ctx.lineWidth = gapW
    ctx.stroke()
    ribbonPath(ctx, band.pts, radius)
    ctx.strokeStyle = bandColor(cfg, band, total)
    ctx.lineWidth = bw
    ctx.stroke()
  }

  // ── Pass 3: over-lift — raise the over-strand above the under at every X ────
  const reach = geo.liftReach
  for (const x of geo.xings) {
    const ax = x.x - x.ux * reach
    const ay = x.y - x.uy * reach
    const cx = x.x + x.ux * reach
    const cy = x.y + x.uy * reach
    // Punch the gap across the under strand.
    ctx.strokeStyle = cfg.background
    ctx.lineWidth = gapW
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(cx, cy)
    ctx.stroke()
    // Redraw the over strand's bright core on top.
    ctx.strokeStyle =
      cfg.colorMode === 'rainbow' && x.overBand >= 0
        ? bandColor(cfg, geo.bands[x.overBand], total)
        : cfg.band
    ctx.lineWidth = bw
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(cx, cy)
    ctx.stroke()
  }

  ctx.restore()
  ctx.globalAlpha = 1
}
