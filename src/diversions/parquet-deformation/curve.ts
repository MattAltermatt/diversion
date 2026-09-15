/** An edge curve: 2·N values, [u0,v0,u1,v1,…]. `u` runs 0→1 along the edge,
 *  `v` is the perpendicular offset. Every edge in the tiling is one of these. */
export type Curve = Float32Array

/** Points per resampled curve. It must OUT-sample the most convoluted keyframe:
 *  at 96 the organic scheme's late curls got chords cut across them (measured in
 *  the mockup). Revisit only with a capture, never on a hunch. */
export const CURVE_POINTS = 160

/** Peak tilt of the parameter field's axis, in radians (~6.9°). */
export const SWING = 0.12
/** How fast the tilt oscillates relative to the phase. Deliberately not a simple
 *  fraction: triWave has period 2, so a rational ratio here would make the whole
 *  field periodic, and at the shipped drift that loop is ~95 s. */
export const SWING_RATIO = 0.2113
/** Lattice-space pivot for the Ramp/Diagonal swing. Constant, so the field is
 *  viewport-independent; offset far enough that no visible row sits on it. */
export const SWING_PIVOT_X = 0
export const SWING_PIVOT_Y = -18

export function resample(pts: number[][], n: number): Curve {
  const d = [0]
  for (let i = 1; i < pts.length; i++) {
    d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  }
  const total = d[d.length - 1] || 1
  const out = new Float32Array(n * 2)
  let j = 0
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total
    while (j < d.length - 2 && d[j + 1] < target) j++
    const seg = d[j + 1] - d[j] || 1
    const s = (target - d[j]) / seg
    out[k * 2] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * s
    out[k * 2 + 1] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * s
  }
  return out
}

export function lerpCurve(a: Curve, b: Curve, s: number): Curve {
  const out = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * s
  return out
}

/** 0→1→0, period 2. The triangle removes the seam a one-way ramp would leave,
 *  and it is Kaplan's own "tent" parameter space. */
export function triWave(u: number): number {
  const f = ((u % 2) + 2) % 2
  return f < 1 ? f : 2 - f
}

export type FieldKind = 'Ramp' | 'Radial' | 'Diagonal'

/**
 * The parameter field. A pure function of position and phase, so the two tiles
 * sharing an edge independently compute the identical value at its midpoint —
 * that is what makes the tiling gap-free by construction.
 *
 * The swing term tilts the field's axis on an incommensurate period, so the
 * picture never returns to an identical state: θ and the phase have no common
 * period, and the exact 95 s loop becomes a quasi-periodic wander.
 *
 * ⚠️ It does NOT remove the SPATIAL repeat. At any single instant θ is a
 * constant, so this is still a plane wave, merely rotated by up to 6.9°, and its
 * spatial period is unchanged at 2·span along the tilted axis. What keeps the
 * repeat off screen is a wide `rampWidth`.
 *
 * ⚠️ Ramp and Diagonal pivot on a LATTICE constant, never on the view centre.
 * Pivoting on (cx, cy) makes the field a function of the viewport — and through
 * Math.ceil, a step function of it — so the picture jumps on resize and one URL
 * renders different parts of the catalogue in the Config preview and on Play.
 * Radial legitimately uses cx/cy: rings belong centred on the view.
 */
export function paramAt(
  kind: FieldKind, x: number, y: number, cx: number, cy: number, span: number, phase: number,
): number {
  const s = span || 1
  const th = SWING * Math.sin(phase * SWING_RATIO * Math.PI)
  const co = Math.cos(th)
  const si = Math.sin(th)
  const px = x - SWING_PIVOT_X
  const py = y - SWING_PIVOT_Y
  let f: number
  if (kind === 'Ramp') {
    f = (px * co + py * si) / s
  } else if (kind === 'Diagonal') {
    f = (px * (co - si) + py * (si + co)) / (s * 1.35)
  } else {
    // Radial has no axis to tilt — rotating a ring field is the identity — so the
    // secondary term is an ANISOTROPY: the rings breathe slightly elliptical on
    // the same incommensurate period.
    const e = 1 + th * 1.5
    f = Math.hypot((x - cx) / e, (y - cy) * e) / s
  }
  return triWave(f + phase)
}

/**
 * Place `c` along the edge A→B, appending 2·(c.length/2) numbers to `out`.
 *
 * ⚠️ A,B are always the edge's CANONICAL endpoints (left-to-right for a
 * horizontal edge, bottom-to-top for a vertical one). `rev` reverses only the
 * ORDER the points are emitted in — it does NOT negate the offset. Negating it
 * instead puts a straight chord across every tile, because the traversal then
 * starts at the wrong end. (Observed and fixed in the mockup.)
 */
export function placeEdge(
  out: number[], ax: number, ay: number, bx: number, by: number,
  c: Curve, amp: number, rev: boolean,
): void {
  const dx = bx - ax
  const dy = by - ay
  const n = c.length / 2
  for (let i = 0; i < n; i++) {
    const k = rev ? n - 1 - i : i
    const u = c[k * 2]
    const v = c[k * 2 + 1] * amp
    out.push(ax + u * dx - v * dy, ay + u * dy + v * dx)
  }
}

/**
 * Assemble tile (i,j) from its four edges, in order [bottom, right, top, left].
 * Bottom and right run forward; top and left are shared with the neighbour above
 * and to the left, so they are the SAME canonical placement, emitted reversed.
 */
export function buildTilePath(
  out: number[], i: number, j: number, edges: [Curve, Curve, Curve, Curve], amp: number,
): void {
  placeEdge(out, i, j, i + 1, j, edges[0], amp, false)
  placeEdge(out, i + 1, j, i + 1, j + 1, edges[1], amp, false)
  placeEdge(out, i, j + 1, i + 1, j + 1, edges[2], amp, true)
  placeEdge(out, i, j, i, j + 1, edges[3], amp, true)
}
