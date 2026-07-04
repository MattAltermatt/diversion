// Spirograph — hypotrochoid / epitrochoid rosettes. Pure, framework-agnostic math
// (no DOM) so it stays unit-testable. A pen at offset d·r rides a circle of radius
// r rolling inside (hypo) or outside (epi) a fixed circle of radius R:
//   hypo: x = (R−r)cosθ + dr·cos(((R−r)/r)θ),  y = (R−r)sinθ − dr·sin(((R−r)/r)θ)
//   epi:  x = (R+r)cosθ − dr·cos(((R+r)/r)θ),  y = (R+r)sinθ − dr·sin(((R+r)/r)θ)
// For integer R,r the curve closes after θ spans 2π·r/gcd(R,r); it then reseeds a
// fresh rosette for an endless bloom loop. All randomness is seeded (mulberry32).
import { mulberry32 } from '../../framework/rng'

export type SpiroMode = 'inside' | 'outside'

export interface Rosette {
  R: number // fixed-circle "teeth" (integer)
  r: number // rolling-circle "teeth" (integer, < R for a clean bloom)
  d: number // pen offset as a fraction of r (0 = center, 1 = rim, >1 = looping)
  mode: SpiroMode
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b)
  while (b) { [a, b] = [b, a % b] }
  return a || 1
}

/** Number of petals / lobes the rosette resolves into. */
export function petalCount(R: number, r: number): number {
  return Math.round(R / gcd(Math.round(R), Math.round(r)))
}

/** Full revolutions of θ before the curve closes. */
export function revolutions(R: number, r: number): number {
  const ri = Math.round(r)
  return ri / gcd(Math.round(R), ri)
}

/** θ span for one closed traversal (radians). */
export function thetaMax(R: number, r: number): number {
  return 2 * Math.PI * revolutions(R, r)
}

/** Sample the pen position (in curve units, centred on origin) at angle θ. */
export function penAt(ros: Rosette, theta: number): { x: number; y: number } {
  const { R, r, d, mode } = ros
  const off = d * r
  if (mode === 'inside') {
    const b = R - r
    const k = b / r
    return {
      x: b * Math.cos(theta) + off * Math.cos(k * theta),
      y: b * Math.sin(theta) - off * Math.sin(k * theta),
    }
  } else {
    const b = R + r
    const k = b / r
    return {
      x: b * Math.cos(theta) - off * Math.cos(k * theta),
      y: b * Math.sin(theta) - off * Math.sin(k * theta),
    }
  }
}

/** The pen's max distance from origin — used to fit the rosette to the canvas. */
export function maxRadius(ros: Rosette): number {
  const base = ros.mode === 'inside' ? Math.abs(ros.R - ros.r) : ros.R + ros.r
  return base + ros.d * ros.r
}

export interface SampledCurve {
  xs: Float64Array
  ys: Float64Array
  count: number
  thetaMax: number
  maxR: number
}

/** Sample the whole closed curve at a fixed angular resolution (samplesPerRev
 *  points per 2π), returning packed coordinate arrays plus the fit radius. */
export function sampleCurve(ros: Rosette, samplesPerRev = 360): SampledCurve {
  const tMax = thetaMax(ros.R, ros.r)
  const step = (2 * Math.PI) / samplesPerRev
  const count = Math.max(2, Math.ceil(tMax / step) + 1)
  const xs = new Float64Array(count)
  const ys = new Float64Array(count)
  for (let i = 0; i < count; i++) {
    const theta = Math.min(i * step, tMax)
    const p = penAt(ros, theta)
    xs[i] = p.x
    ys[i] = p.y
  }
  return { xs, ys, count, thetaMax: tMax, maxR: maxRadius(ros) }
}

/** Roll a fresh rosette from a seeded RNG. Constrained so the bloom reads as a
 *  clean symmetric rosette (3..13 petals, a modest number of revolutions so a
 *  trace never crawls). Falls back to a known-good rosette if the draw is unlucky. */
export function pickRosette(rng: () => number): Rosette {
  const randInt = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))
  for (let attempt = 0; attempt < 40; attempt++) {
    const R = randInt(5, 13)
    const r = randInt(2, R - 1)
    if (r === R) continue
    const petals = petalCount(R, r)
    const revs = revolutions(R, r)
    if (petals < 3 || petals > 13) continue
    if (revs > 8) continue
    const d = 0.4 + rng() * 0.75 // 0.4..1.15 — curtate through mildly looping
    const mode: SpiroMode = rng() < 0.5 ? 'inside' : 'outside'
    return { R, r, d, mode }
  }
  return { R: 7, r: 3, d: 0.75, mode: 'inside' }
}

export { mulberry32 }
