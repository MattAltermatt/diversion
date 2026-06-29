import { mulberry32 } from '../../framework/rng'

// Hopalong (Barry Martin) was scoped for v1 but removed before ship: it is
// space-filling rather than filamentary, so at any reasonable point count it
// reads as a flat full-screen mesh, never the luminous filaments of the sin/cos
// maps. Tracked as a fast-follow needing density-normalization + its own
// aesthetic pass. Its kernel:  x' = y − sign(x)·√|b·x − c|,  y' = a − x.
export type AttractorKind = 'clifford' | 'deJong'
export interface Coeffs { a: number; b: number; c: number; d: number }

type StepFn = (x: number, y: number, c: Coeffs) => { x: number; y: number }

// The two iterated maps. Both are sin/cos self-bounding by construction, so they
// can never diverge to NaN/∞ (|x'| ≤ 1+|c| for Clifford, ≤ 2 for de Jong).
export const MAPS: Record<AttractorKind, StepFn> = {
  clifford: (x, y, c) => ({
    x: Math.sin(c.a * y) + c.c * Math.cos(c.a * x),
    y: Math.sin(c.b * x) + c.d * Math.cos(c.b * y),
  }),
  deJong: (x, y, c) => ({
    x: Math.sin(c.a * y) - Math.cos(c.b * x),
    y: Math.sin(c.c * x) - Math.cos(c.d * y),
  }),
}

// Curated known-good coefficient sets — the guaranteed fallback when rejection
// sampling exhausts its tries, and the starting point for hand-tuned presets.
export const FALLBACK: Record<AttractorKind, Coeffs> = {
  clifford: { a: -1.4, b: 1.6, c: 1.0, d: 0.7 },
  deJong: { a: 1.4, b: -2.3, c: 2.4, d: -2.1 },
}

const MAG_GUARD = 1e4 // defensive only; the sin/cos maps are provably bounded

/** Integrate ~500 points; reject non-finite / over-magnitude / collapsed orbits. */
export function isValidOrbit(kind: AttractorKind, c: Coeffs): boolean {
  const step = MAPS[kind]
  let x = 0.1, y = 0.1
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < 500; i++) {
    const n = step(x, y, c); x = n.x; y = n.y
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    if (Math.abs(x) > MAG_GUARD || Math.abs(y) > MAG_GUARD) return false
    if (i > 50) { // skip the transient before measuring spread
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  }
  const spread = (maxX - minX) + (maxY - minY)
  return spread > 0.4 // below this it collapsed to a point / short limit cycle
}

/** seed → first valid coefficient set (cap 40 tries → curated fallback). */
export function sampleCoeffs(kind: AttractorKind, seed: number): Coeffs {
  const rng = mulberry32(seed >>> 0)
  const draw = () => rng() * 6 - 3 // [-3, 3]
  for (let i = 0; i < 40; i++) {
    const c: Coeffs = { a: draw(), b: draw(), c: draw(), d: draw() }
    if (isValidOrbit(kind, c)) return c
  }
  return { ...FALLBACK[kind] }
}

const DRIFT_RATE = 0.00018 // base angular rate (rad/ms) at drift=1 — slow, zen
const DRIFT_AMP_MAX = 0.18 // max coeff wobble in world units at drift=1
const FREQS = [1.0, 1.31, 1.73, 2.11] as const // incommensurate → quasi-periodic

/** Sinusoidal wobble around base. drift=0 → base unchanged (frozen). Bounded by
 *  DRIFT_AMP_MAX·drift for every t, so it never trips the validity gate. */
export function driftedCoeffs(base: Coeffs, t: number, drift: number): Coeffs {
  if (drift === 0) return base
  const amp = DRIFT_AMP_MAX * drift
  const w = t * DRIFT_RATE
  return {
    a: base.a + amp * Math.sin(w * FREQS[0]),
    b: base.b + amp * Math.sin(w * FREQS[1]),
    c: base.c + amp * Math.sin(w * FREQS[2]),
    d: base.d + amp * Math.sin(w * FREQS[3]),
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Map a plotted point's screen position to t in [0,1] for color. */
export function attractorColorT(
  source: 'radius' | 'x' | 'y',
  sx: number, sy: number, cx: number, cy: number, maxR: number, w: number, h: number,
): number {
  if (source === 'x') return clamp01(sx / w)
  if (source === 'y') return clamp01(sy / h)
  return clamp01(Math.hypot(sx - cx, sy - cy) / maxR)
}

// Per-map world half-extent — the nominal coordinate range each map occupies.
const WORLD_RADIUS: Record<AttractorKind, number> = {
  clifford: 2.8, deJong: 2.6,
}
/** Pixels per world unit: fit the map's nominal extent into 90% of min dimension.
 *  Fixed (not auto-fit) so there's no jittery breathing zoom. */
export function screenScale(kind: AttractorKind, w: number, h: number): number {
  const minDim = Math.min(w, h)
  return (minDim * 0.45) / WORLD_RADIUS[kind]
}
