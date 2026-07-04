// Pedal & Rose — polar rhodonea rose curves r = a·cos(k·θ) (k = n/d rational) and
// the PEDAL curve of that same rose (the locus of feet of perpendiculars dropped
// from the origin onto the rose's tangents). Pure, framework-agnostic math (no DOM)
// so it stays unit-testable. A pen traces the curve slowly, the bloom holds, fades,
// and a fresh k (and curve type) reseeds — an endless mandala loop. Amplitude is
// fixed at 1 (the renderer autofits), so shape depends only on k and the type.
// All randomness is seeded (mulberry32) → the same seed replays the same blooms.
import { mulberry32 } from '../../framework/rng'

export type CurveType = 'rose' | 'pedal'

export interface RoseCurve {
  type: CurveType
  n: number // petal numerator (integer ≥ 1)
  d: number // petal denominator (integer ≥ 1); k = n/d
}

export function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b))
  while (b) { [a, b] = [b, a % b] }
  return a || 1
}

/** Reduce n/d to lowest terms. */
export function reduce(n: number, d: number): [number, number] {
  const g = gcd(n, d)
  return [Math.round(n) / g, Math.round(d) / g]
}

/** Petals a rhodonea r = cos((n/d)θ) resolves into: n if n·d is odd, else 2n
 *  (using the reduced fraction). The pedal shares the base rose's symmetry. */
export function petalCount(n: number, d: number): number {
  const [rn, rd] = reduce(n, d)
  return (rn * rd) % 2 === 1 ? rn : 2 * rn
}

/** θ span for one closed traversal of the rose (radians): d·π when n·d is odd
 *  (the curve retraces after that), else 2·d·π — reduced fraction. */
export function petalPeriod(n: number, d: number): number {
  const [rn, rd] = reduce(n, d)
  return ((rn * rd) % 2 === 1 ? rd : 2 * rd) * Math.PI
}

/** Pen position (curve units, centred on origin, amplitude 1) at angle θ.
 *  rose:  the point on r = cos(kθ).
 *  pedal: the foot of the perpendicular from the origin to the tangent of that
 *         rose at θ. For a polar curve r = f(θ) with C = f·(cosθ,sinθ) one has
 *         C·C' = f·f' and |C'|² = f² + f'², so the foot has a clean closed form. */
export function penAt(curve: RoseCurve, theta: number): { x: number; y: number } {
  const k = curve.n / curve.d
  const f = Math.cos(k * theta)
  const ct = Math.cos(theta)
  const st = Math.sin(theta)
  if (curve.type === 'rose') {
    return { x: f * ct, y: f * st }
  }
  // Pedal: Foot = C − s·C', with s = (f·f')/(f²+f'²).
  const fp = -k * Math.sin(k * theta) // f'(θ)
  const denom = f * f + fp * fp
  const s = denom > 1e-12 ? (f * fp) / denom : 0
  // C' = (fp·cosθ − f·sinθ, fp·sinθ + f·cosθ)
  return {
    x: f * ct - s * (fp * ct - f * st),
    y: f * st - s * (fp * st + f * ct),
  }
}

export interface SampledCurve {
  xs: Float64Array
  ys: Float64Array
  count: number
  thetaMax: number
  maxR: number // max distance from origin across the samples (for autofit)
}

/** Sample the whole closed curve over one fundamental period at a fixed angular
 *  resolution (samplesPerRev points per 2π), returning packed coordinate arrays
 *  plus the fit radius. Endpoint is inclusive so the traced stroke closes. */
export function sampleCurve(curve: RoseCurve, samplesPerRev = 720): SampledCurve {
  const tMax = petalPeriod(curve.n, curve.d)
  const step = (2 * Math.PI) / samplesPerRev
  const count = Math.max(2, Math.ceil(tMax / step) + 1)
  const xs = new Float64Array(count)
  const ys = new Float64Array(count)
  let maxR = 0
  for (let i = 0; i < count; i++) {
    const theta = Math.min(i * step, tMax)
    const p = penAt(curve, theta)
    xs[i] = p.x
    ys[i] = p.y
    const rr = p.x * p.x + p.y * p.y
    if (rr > maxR) maxR = rr
  }
  return { xs, ys, count, thetaMax: tMax, maxR: Math.sqrt(maxR) || 1 }
}

/** Roll a fresh curve from a seeded RNG. Constrained so the bloom reads as a
 *  clean symmetric mandala (3..16 petals, a modest number of revolutions so a
 *  trace never crawls). Falls back to a known-good rose if the draw is unlucky. */
export function pickCurve(rng: () => number): RoseCurve {
  const randInt = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))
  for (let attempt = 0; attempt < 60; attempt++) {
    const n = randInt(2, 12)
    const d = randInt(1, 6)
    const [rn, rd] = reduce(n, d)
    if (rd >= rn) continue // keep k > 1 so petals stay legible
    const petals = petalCount(rn, rd)
    if (petals < 3 || petals > 16) continue
    const revs = petalPeriod(rn, rd) / (2 * Math.PI)
    if (revs > 6) continue // long traces crawl — keep it lively
    const type: CurveType = rng() < 0.5 ? 'rose' : 'pedal'
    return { type, n: rn, d: rd }
  }
  return { type: 'rose', n: 5, d: 1 }
}

export { mulberry32 }
