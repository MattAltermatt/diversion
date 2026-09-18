import { mulberry32 } from '../../framework/rng'
import type { Composition } from './composition'

// ─────────────────────────────────────────────────────────────────────────────
// THE PEN — turns a Composition's strokes into a stream of powder stamps, one
// short streak at a time, at a fixed pace along arc length.
//
// `advance` is PURE with respect to drawing: it mutates the `PenState` handed
// to it (the running position along the composition) and returns the `Stamp`s
// produced this call. `drawStamp` is the only thing that touches a canvas.
// Splitting it this way is what makes the frame-chunking invariant testable at
// all — the stamp STREAM is a plain array of primitives, comparable with
// `toEqual` under any chunking regime.
//
// ⚠️ NON-NEGOTIABLE 1 — whole steps only, remainder CARRIED, clamped at
// `comp.total`. Stepping by `min(carry, step)` places a stamp at a partial
// offset every time a frame's budget runs out mid-step, and the next frame
// resumes from there — an extra, differently-placed stamp at every frame
// boundary. Same accumulator discipline as a spawn gate: carry the remainder,
// never truncate it. (See `gotcha-spawn-gate-accumulator`.)
//
// ⚠️ NON-NEGOTIABLE 2 — each stamp's `seed` is derived from its own ordinal,
// `Math.imul(pen.stamps, 0x9e3779b1) ^ seed`, and it travels IN the `Stamp` so
// `drawStamp` can rebuild the identical jitter. An earlier design kept the rng
// on the drawing side only, seeded once per `advance()` call from `pen.drawn`
// — which made a per-call-rng mutant UNKILLABLE, because the stamp stream
// (positions, colours, seeds) came back byte-identical regardless: nothing in
// the stream depended on how the draws inside one call were used.
//
// ⚠️ NON-NEGOTIABLE 3 — `stroke` is the stroke index and `ord` is the stamp
// ordinal, both carried in the `Stamp` so a reordering is observable in the
// stream string a test builds from it.
// ─────────────────────────────────────────────────────────────────────────────

export interface PenState {
  si: number
  at: number
  carry: number
  stamps: number
  drawn: number
}

export function newPen(): PenState {
  return { si: 0, at: 0, carry: 0, stamps: 0, drawn: 0 }
}

/** `stroke` is the stroke index; `ord` is the stamp ordinal; `seed` is the
 *  jitter seed DERIVED FROM `ord` (see non-negotiable 2), carried here so
 *  `drawStamp` can rebuild the same jitter from the stamp alone. */
export interface Stamp {
  stroke: number
  ord: number
  x: number
  y: number
  tx: number
  ty: number
  col: string
  seed: number
}

/** Advance the pen by `dist` px of travel budget, laying whole `step`-length
 *  stamps until the budget (or `maxStamps` for this call, or the composition
 *  itself) runs out. Mutates `pen` in place; returns the stamps laid. */
export function advance(
  pen: PenState, comp: Composition, dist: number,
  step: number, maxStamps: number, seed: number,
): Stamp[] {
  const S = comp.strokes
  const out: Stamp[] = []
  pen.carry = Math.min(pen.carry + dist, comp.total)

  let n = 0
  while (pen.carry >= step && pen.si < S.length && n < maxStamps) {
    const s = S[pen.si]
    if (s.len <= 0) { pen.si++; pen.at = 0; continue }

    const to = Math.min(s.len, pen.at + step)
    let lo = 0, hi = s.cum.length - 1
    while (lo < hi) { const m = (lo + hi) >> 1; if (s.cum[m] < to) lo = m + 1; else hi = m }
    const bi = Math.max(1, lo), ai = bi - 1
    const a = s.pts[ai], b = s.pts[bi]
    const f = s.cum[bi] === s.cum[ai] ? 0 : (to - s.cum[ai]) / (s.cum[bi] - s.cum[ai])
    let tx = b.x - a.x, ty = b.y - a.y
    const m2 = Math.hypot(tx, ty) || 1
    tx /= m2; ty /= m2

    out.push({
      stroke: pen.si,
      ord: pen.stamps,
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      tx, ty,
      col: s.col,
      seed: (Math.imul(pen.stamps, 0x9e3779b1) ^ seed) >>> 0,
    })

    pen.stamps++
    n++
    pen.carry -= to - pen.at
    pen.drawn += to - pen.at
    pen.at = to
    if (to >= s.len - 1e-6) { pen.si++; pen.at = 0 }
  }
  return out
}

/** Powder laid as a STREAK along the direction of travel, not as a disc — a
 *  disc knows nothing about which way the hand was going. A core streak along
 *  the tangent, a soft scatter either side, and a few finer fraying streaks
 *  offset perpendicular so the edge looks torn rather than machined. Jitter is
 *  rebuilt from `s.seed`, never from an rng the caller owns, so the same stamp
 *  always paints the same mark regardless of draw order. */
export function drawStamp(ctx: CanvasRenderingContext2D, s: Stamp, w: number, grain: number): void {
  const rng = mulberry32(s.seed)
  const tx = s.tx, ty = s.ty
  const nx = -ty, ny = tx

  const streak = (cx: number, cy: number, len: number, ang: number) => {
    const ca = Math.cos(ang), sa = Math.sin(ang)
    const dx = (tx * ca - ty * sa) * len * 0.5
    const dy = (tx * sa + ty * ca) * len * 0.5
    ctx.beginPath()
    ctx.moveTo(cx - dx, cy - dy)
    ctx.lineTo(cx + dx, cy + dy)
    ctx.stroke()
  }

  ctx.strokeStyle = s.col
  ctx.lineCap = 'round'

  // the scatter either side, smeared along the stroke rather than pooled
  ctx.globalAlpha = 0.035 + 0.06 * (1 - grain)
  ctx.lineWidth = w * 2.7
  streak(s.x, s.y, w * 2.4, 0)

  // the core the hand actually laid
  ctx.globalAlpha = 0.46
  ctx.lineWidth = w * 0.8
  streak(s.x, s.y, w * 2.2, (rng() - 0.5) * 0.10)

  // fibre: a few finer, longer streaks fraying the edge
  const n = 1 + Math.round(grain * 3)
  for (let i = 0; i < n; i++) {
    const off = (rng() - 0.5) * w * (0.8 + grain * 1.6)
    ctx.globalAlpha = 0.14 + rng() * 0.42
    ctx.lineWidth = w * (0.13 + rng() * 0.25)
    streak(s.x + nx * off, s.y + ny * off, w * (1.3 + rng() * 3.0), (rng() - 0.5) * 0.22)
  }
  ctx.globalAlpha = 1
}
