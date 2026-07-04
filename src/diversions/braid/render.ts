import type { Braid } from './braid'

// Rendering the woven ring. Same three tricks as the Celtic knot so the over/under
// reads as a true interlace:
//   1. Each strand is a wide dark GAP stroke (background colour) with a narrower
//      bright CORE on top — adjacent strands are always separated by a dark channel.
//   2. Strands are drawn as continuous closed loops (all crossings ambiguous).
//   3. An OVER-LIFT pass then, at every crossing, punches a dark gap across the
//      under-strand along the OVER strand's tangent and redraws the over strand's
//      core on top — lifting it above. The over/under choice is the seeded
//      plain-weave checkerboard baked into the geometry, so it is globally consistent.

function project(cx: number, cy: number, ang: number, rad: number, rot: number) {
  const a = ang + rot
  return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) }
}

function tracePath(ctx: CanvasRenderingContext2D, braid: Braid, pts: { ang: number; rad: number }[], rot: number) {
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const p = project(braid.cx, braid.cy, pts[i].ang, pts[i].rad, rot)
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  }
  ctx.closePath()
}

export function renderBraid(ctx: CanvasRenderingContext2D, braid: Braid, w: number, h: number, rot: number) {
  ctx.fillStyle = braid.background
  ctx.fillRect(0, 0, w, h)

  const coreW = braid.strandWidth
  const gapW = coreW + Math.max(4, coreW * 0.6)
  const reach = Math.max(braid.laneSpacing * 0.7, coreW * 0.85)

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // ── Pass 1: soft glow halo (optional) ──────────────────────────────────────
  if (braid.glow > 0.001) {
    ctx.globalAlpha = braid.glow * 0.35
    ctx.lineWidth = coreW * 2.2
    for (const strand of braid.strands) {
      ctx.strokeStyle = strand.color
      tracePath(ctx, braid, strand.pts, rot)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  // ── Pass 2: continuous strands — dark gap then bright core, strand by strand ─
  for (const strand of braid.strands) {
    tracePath(ctx, braid, strand.pts, rot)
    ctx.strokeStyle = braid.background
    ctx.lineWidth = gapW
    ctx.stroke()
    tracePath(ctx, braid, strand.pts, rot)
    ctx.strokeStyle = strand.color
    ctx.lineWidth = coreW
    ctx.stroke()
  }

  // ── Pass 3: over-lift — raise the over-strand above the under at every X ─────
  const total = braid.total
  for (const x of braid.crossings) {
    const ov = braid.strands[x.overStrand]
    const i = x.centerIdx
    const cp = project(braid.cx, braid.cy, ov.pts[i].ang, ov.pts[i].rad, rot)
    const pa = ov.pts[(i - 1 + total) % total]
    const pb = ov.pts[(i + 1) % total]
    const a = project(braid.cx, braid.cy, pa.ang, pa.rad, rot)
    const b = project(braid.cx, braid.cy, pb.ang, pb.rad, rot)
    let tx = b.x - a.x
    let ty = b.y - a.y
    const len = Math.hypot(tx, ty) || 1
    tx /= len
    ty /= len
    const ax = cp.x - tx * reach
    const ay = cp.y - ty * reach
    const bx = cp.x + tx * reach
    const by = cp.y + ty * reach
    // Punch the dark gap across the under strand.
    ctx.strokeStyle = braid.background
    ctx.lineWidth = gapW
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()
    // Redraw the over strand's bright core on top.
    ctx.strokeStyle = ov.color
    ctx.lineWidth = coreW
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()
  }

  ctx.globalAlpha = 1
}
