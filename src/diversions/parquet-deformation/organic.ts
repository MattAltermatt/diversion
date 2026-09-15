import { resample, CURVE_POINTS, type Curve } from './curve'

/** Repulsion radius, in edge-length units. */
export const ORGANIC_REP = 0.075
/**
 * Hard cap on how far one point moves in one iteration.
 *
 * ⚠️ This is an invariant, not a tuning value. At step·force > ORGANIC_REP a
 * point jumps clean through the neighbour repelling it and oscillates, and the
 * result is a spiky self-crossing tangle rather than curls. Measured in the
 * mockup; guarded by organic.test.ts through the probe below, which reads the
 * simulation's own step rather than a resampled snapshot.
 */
export const ORGANIC_MAX_STEP = ORGANIC_REP * 0.18
/** Iterations per emitted keyframe. */
export const ORGANIC_ITERS = 6

const MAX_SEG = 0.045
const MAX_PTS = 130
const SKIP = 3

/**
 * The copies of this edge that surround it in the tiling: [dx, dy, rotated].
 *
 * The first is the curve itself; the next four are its translations one lattice
 * step away; the last four are the 90°-rotated copies sitting on the vertical
 * edges at each endpoint — two above the line and two below.
 *
 * ⚠️ The rotated bases must be (0,0), (1,0), (0,-1), (1,-1). Using (0,1)/(1,1)
 * instead puts those copies at `jy = 1 + u ∈ [1,2]`, and the reference curve is
 * clamped to |v| ≤ 0.48, so |dy| ≥ 0.52 against a repulsion radius of 0.075 —
 * they could never contribute a single force, leaving the curve repelled from
 * above and not below, i.e. an asymmetric field biasing it downward.
 */
const NEIGHBOURS: [number, number, 0 | 1][] = [
  [0, 0, 0], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0],
  [0, 0, 1], [1, 0, 1], [0, -1, 1], [1, -1, 1],
]

export const ORGANIC_FAMILIES: { name: 'Calm' | 'Restless' | 'Wild'; wobble: number }[] = [
  { name: 'Calm', wobble: 0.0015 },
  { name: 'Restless', wobble: 0.006 },
  { name: 'Wild', wobble: 0.016 },
]

/**
 * Pedersen & Singh organic growth on one tile edge, with both endpoints pinned
 * (they are tiling vertices). Kaplan §5: snapshot every few iterations and use
 * the snapshots as keyframes — the sim is smooth enough that no interpolation
 * between them is needed.
 *
 * `probe`, when supplied, reports the largest per-iteration displacement the
 * integrator actually applied. Tests bound THAT against ORGANIC_MAX_STEP:
 * comparing resampled keyframes instead cannot see the invariant, because
 * resample redistributes points by arc length and a point slides along the curve
 * as it grows — measured at 0.113 against a 0.085 ceiling on correct code.
 */
export function organicKeyframes(
  frames: number, wobble: number, seed: number, probe?: { maxStep: number },
): Curve[] {
  let s = seed >>> 0
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5)

  // A perfectly straight line is an equilibrium — with nothing to buckle out of,
  // growth does nothing. Seed a small perturbation, enveloped to zero at both
  // pinned ends. Brownian noise stays tiny after this: what convolutes the curve
  // is growth against repulsion, not noise.
  const pts: number[][] = []
  const n0 = 20
  for (let i = 0; i <= n0; i++) {
    const u = i / n0
    const env = Math.sin(Math.PI * u)
    pts.push([u, env * (Math.sin(u * 9.1 + (seed % 7)) * 0.012 + rnd() * 0.006)])
  }

  const stack: Curve[] = [resample(pts, CURVE_POINTS)]
  // Scratch for the neighbour-position table, grown as the curve gains points.
  let njx = new Float64Array(0)
  let njy = new Float64Array(0)
  for (let f = 0; f < frames; f++) {
    for (let it = 0; it < ORGANIC_ITERS; it++) {
      const fx = new Float64Array(pts.length)
      const fy = new Float64Array(pts.length)
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i]
        const a = pts[i - 1]
        const b = pts[i + 1]
        fx[i] += ((a[0] + b[0]) / 2 - p[0]) * 0.85
        fy[i] += ((a[1] + b[1]) / 2 - p[1]) * 0.85
        fx[i] += rnd() * wobble
        fy[i] += rnd() * wobble
      }
      // Repulsion against this curve AND the copies of it that surround it.
      //
      // The neighbour positions depend on `j` and `o` only, so they are built
      // ONCE per iteration here rather than recomputed inside the `i` loop —
      // which was 43.8M redundant recomputations of the same 9xN values per
      // stack, and made this diversion's setup() the heaviest in the gallery by
      // 18x (334 ms, against a 0.52 ms median across 137 pieces) on a path that
      // runs during gallery SCROLL. The loop order and the accumulation order are
      // unchanged, so the output stays bit-for-bit identical.
      const np = pts.length
      if (njx.length < np * NEIGHBOURS.length) {
        njx = new Float64Array(np * NEIGHBOURS.length)
        njy = new Float64Array(np * NEIGHBOURS.length)
      }
      for (let j = 0; j < np; j++) {
        const px = pts[j][0]
        const py = pts[j][1]
        for (let o = 0; o < NEIGHBOURS.length; o++) {
          const nb = NEIGHBOURS[o]
          // A rotated copy runs bottom-to-top: (u,v) -> (-v, u).
          njx[j * NEIGHBOURS.length + o] = nb[2] ? -py + nb[0] : px + nb[0]
          njy[j * NEIGHBOURS.length + o] = nb[2] ? px + nb[1] : py + nb[1]
        }
      }
      for (let i = 1; i < np - 1; i++) {
        const ix = pts[i][0]
        const iy = pts[i][1]
        for (let j = 0; j < np; j++) {
          // SKIP exists to stop a point repelling its own immediate neighbours
          // ALONG THIS CURVE, where it would fight the smoothing term. It is
          // meaningless for any other copy: point i of the reference and point
          // j of a translated or rotated copy are distinct points in space even
          // when i === j. Guarding on |i-j| for every copy skips a whole diagonal
          // band of the interaction matrix, including the near-vertex approaches
          // that are exactly where a horizontal edge meets its perpendicular
          // neighbour — so the guard applies to the self copy (o === 0) alone.
          const skipSelf = Math.abs(i - j) < SKIP
          const base = j * NEIGHBOURS.length
          for (let o = 0; o < NEIGHBOURS.length; o++) {
            if (o === 0 && skipSelf) continue
            const dx = ix - njx[base + o]
            // |dx| > REP implies d2 > REP^2, so this skips no force that would
            // have been applied — it only avoids computing d2 for the vast
            // majority of pairs that are nowhere near each other.
            if (dx > ORGANIC_REP || dx < -ORGANIC_REP) continue
            const dy = iy - njy[base + o]
            const d2 = dx * dx + dy * dy
            if (d2 > 1e-10 && d2 < ORGANIC_REP * ORGANIC_REP) {
              const d = Math.sqrt(d2)
              const w = (ORGANIC_REP - d) / ORGANIC_REP
              fx[i] += (dx / d) * w
              fy[i] += (dy / d) * w
            }
          }
        }
      }
      for (let i = 1; i < pts.length - 1; i++) {
        let mx = fx[i] * 0.08
        let my = fy[i] * 0.08
        const m = Math.hypot(mx, my)
        if (m > ORGANIC_MAX_STEP) {
          mx = (mx / m) * ORGANIC_MAX_STEP
          my = (my / m) * ORGANIC_MAX_STEP
        }
        if (probe) probe.maxStep = Math.max(probe.maxStep, Math.hypot(mx, my))
        pts[i][0] += mx
        pts[i][1] += my
        if (pts[i][1] > 0.48) pts[i][1] = 0.48
        if (pts[i][1] < -0.48) pts[i][1] = -0.48
      }
      for (let i = pts.length - 2; i >= 0; i--) {
        const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
        if (d > MAX_SEG && pts.length < MAX_PTS) {
          pts.splice(i + 1, 0, [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2])
        }
      }
    }
    stack.push(resample(pts, CURVE_POINTS))
  }
  return stack
}

/**
 * The saturation knee: the last stage whose arc length is still growing at a
 * useful rate, as a fraction of the stack's own fastest growth.
 *
 * The sim keeps running long after it stops changing SHAPE, so mapping the ramp
 * over the whole stack spends most of the screen on tiles a viewer cannot tell
 * apart.
 *
 * ⚠️ An earlier form used `findIndex(v >= max(L) * 0.99)`. That returns a sane
 * answer ONLY on a stack that peaks and then declines — on a monotone stack it
 * returns the LAST stage, i.e. no knee at all, silently, with every test green.
 * A growth-RATE test is invariant to that. It also requires TWO consecutive
 * sub-threshold stages, because `d` is the increment series of a stochastic sim
 * and a single unlucky stage would otherwise become the knee — and `seed` is
 * randomizeOnFreshLoad, so that would make the shipped look a per-visit lottery.
 */
export function kneeIndex(stack: Curve[]): number {
  if (stack.length < 4) return stack.length - 1
  const len = (c: Curve): number => {
    let s = 0
    for (let i = 1; i < c.length / 2; i++) {
      s += Math.hypot(c[i * 2] - c[(i - 1) * 2], c[i * 2 + 1] - c[(i - 1) * 2 + 1])
    }
    return s
  }
  const L = stack.map(len)
  const d: number[] = []
  for (let i = 1; i < L.length; i++) d.push(L[i] - L[i - 1])
  const fastest = Math.max(...d)
  if (fastest <= 0) return stack.length - 1
  let k = 1
  while (k + 1 < d.length && !(d[k] < fastest * 0.08 && d[k + 1] < fastest * 0.08)) k++
  return Math.min(stack.length - 1, Math.max(2, k))
}
