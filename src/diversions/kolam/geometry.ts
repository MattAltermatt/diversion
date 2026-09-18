// ─────────────────────────────────────────────────────────────────────────────
// OFFSET CURVES — the one genuinely novel module in this piece.
//
// Nothing in src/ offsets a polyline: `celtic` gets its ribbon from a wide dark
// stroke under a narrow bright one, and `parquet-deformation` offsets a curve
// along an edge, not a path into a bundle. A bundle is N copies of one path,
// each displaced along its normal — which is how a real kolam line is laid,
// several passes of the same stroke rather than one wide one.
//
// Offsetting a polyline is NOT "move each point along its normal": at a vertex
// the two adjacent segments have different normals, and moving the shared point
// along either one opens a gap. The point moves along the ANGLE BISECTOR,
// lengthened by 1/cos(θ/2) — the miter.
//
// ⚠️ THE BOUND IS THE DENOMINATOR FLOOR, not a separate cap. `Math.max(0.2, …)`
// limits the scale to 5 on its own. The probe also carried `MITER_CAP = 3.2`,
// justified in an early spec as "what stands between the piece and a spike
// across the picture"; measured, removing it moves 0.06% of vertices by at most
// 2.38 px. It is redundant and it is not here.
//
// ⚠️ The second failure is subtler: where the offset distance exceeds the local
// RADIUS OF CURVATURE, the offset curve turns inside out and traces a small loop
// backwards. Left in, every tight motif grows a bow-tie. Culled by testing each
// offset segment against the direction of the segment it came from. The cull is
// PARTIAL — it removes ~34% of self-intersections, not all of them.
// ─────────────────────────────────────────────────────────────────────────────

export interface Pt {
  x: number
  y: number
}

interface Seg {
  nx: number
  ny: number
  dx: number
  dy: number
}

/** Offsetting a CCW path (in canvas coords, y down) by a positive `d` moves it
 *  INWARD, because the normal is `{-dy, dx}`. `offsetPath(circle(100), 10)`
 *  measures radius 90, not 110. Two drafts of the plan demanded both at once. */
export function offsetPath(pts: Pt[], d: number, closed: boolean): Pt[] {
  const n = pts.length
  if (n < 2 || d === 0) return d === 0 ? pts : []

  const seg: (Seg | null)[] = []
  for (let i = 0; i < n - (closed ? 0 : 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    const dx = b.x - a.x, dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-9) { seg.push(null); continue }
    seg.push({ nx: -dy / len, ny: dx / len, dx: dx / len, dy: dy / len })
  }
  const segAt = (i: number): Seg | null => {
    const m = seg.length
    if (m === 0) return null
    let k = ((i % m) + m) % m
    for (let t = 0; t < m; t++) {
      const s = seg[k]
      if (s) return s
      k = (k + 1) % m
    }
    return null
  }

  const out: (Pt & { src: number })[] = []
  for (let i = 0; i < n; i++) {
    const s0 = closed ? segAt(i - 1) : segAt(Math.max(0, i - 1))
    const s1 = closed ? segAt(i) : segAt(Math.min(seg.length - 1, i))
    if (!s0 || !s1) continue
    let bx = s0.nx + s1.nx, by = s0.ny + s1.ny
    const bl = Math.hypot(bx, by)
    if (bl < 1e-6) continue // 180° hairpin — no sane bisector
    bx /= bl; by /= bl
    const scale = 1 / Math.max(0.2, bx * s1.nx + by * s1.ny)
    out.push({ x: pts[i].x + bx * d * scale, y: pts[i].y + by * d * scale, src: i })
  }

  const keep: Pt[] = []
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length]
    if (!closed && i === out.length - 1) { keep.push({ x: a.x, y: a.y }); break }
    const s = segAt(a.src)
    if (!s) continue
    if ((b.x - a.x) * s.dx + (b.y - a.y) * s.dy >= 0) keep.push({ x: a.x, y: a.y })
  }
  return keep.length >= 3 ? keep : []
}

export interface BundleStroke {
  pts: Pt[]
  closed: boolean
}

/** N copies of one path, centred on it, spread `(count - 1) * spacing`.
 *
 *  ⚠️ A bare 2-point line VANISHES at every count, odd or even: `offsetPath`
 *  returns `[]` below 3 surviving points, and the `d === 0` copy of a 2-point
 *  path is dropped by the same length filter here. Callers that need a straight
 *  line (hatching, the centre frame) must bypass this function. */
export function bundle(pts: Pt[], count: number, spacing: number, closed: boolean): BundleStroke[] {
  const out: BundleStroke[] = []
  for (let i = 0; i < count; i++) {
    const d = (i - (count - 1) / 2) * spacing
    const p = d === 0 ? pts : offsetPath(pts, d, closed)
    if (p.length >= 3) out.push({ pts: p, closed })
  }
  return out
}

/** The small unevenness of a hand — low-frequency, so it reads as drawn rather
 *  than as noise. `closed` is accepted for call-site symmetry with the rest of
 *  this module; the wrap is modular either way. */
export function wobble(pts: Pt[], amt: number, rnd: () => number, _closed: boolean): Pt[] {
  if (amt <= 0) return pts
  const n = pts.length
  const k = 3 + Math.floor(rnd() * 3)
  const ph = rnd() * Math.PI * 2, ph2 = rnd() * Math.PI * 2
  return pts.map((p, i) => {
    const t = (i / n) * Math.PI * 2
    const w = Math.sin(t * k + ph) * 0.6 + Math.sin(t * (k * 2 + 1) + ph2) * 0.4
    const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n]
    const dx = next.x - prev.x, dy = next.y - prev.y
    const l = Math.hypot(dx, dy) || 1
    return { x: p.x + (-dy / l) * w * amt, y: p.y + (dx / l) * w * amt }
  })
}
