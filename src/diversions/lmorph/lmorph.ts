// lmorph — parametric shape morphing. Pure, framework-agnostic math (no DOM) so it
// stays unit-testable. Every target shape is expressed as a single-valued radial
// function r(θ) ≥ 0 and sampled at the SAME angles θ_i = 2π·i/N. Because the whole
// set shares one angular parametrization, morphing is just a per-angle radius lerp —
// the outline can never "scramble" the way index-matched parametric curves do. Each
// shape's radii are normalized so its max radius is 1 (the renderer autofits), so a
// morph eases between two same-size outlines. All randomness is seeded (mulberry32)
// → the same seed replays the same shape set + order + details.
import { mulberry32 } from '../../framework/rng'

export type ShapeType =
  | 'circle' | 'polygon' | 'star' | 'flower' | 'superellipse' | 'gear' | 'heart'

export const SHAPE_TYPES: ShapeType[] = [
  'circle', 'polygon', 'star', 'flower', 'superellipse', 'gear', 'heart',
]

/** A concrete target shape. `m` is the lobe / point / tooth / side count (unused for
 *  circle & heart); `param` is a shape-specific knob (star: inner-radius ratio;
 *  superellipse: exponent p; flower/gear: modulation amplitude). */
export interface Shape {
  type: ShapeType
  m: number
  param: number
}

const TAU = Math.PI * 2

/** Raw (un-normalized) radius of a shape at angle θ. Always finite and ≥ 0. */
export function radiusAt(shape: Shape, theta: number): number {
  const { type, m, param } = shape
  switch (type) {
    case 'circle':
      return 1

    case 'polygon': {
      // Regular m-gon: r(θ) = cos(π/m) / cos(θ_sector − π/m), vertices at r = 1.
      const sector = TAU / m
      const a = ((theta % sector) + sector) % sector
      return Math.cos(Math.PI / m) / Math.cos(a - Math.PI / m)
    }

    case 'star': {
      // m-pointed star: outer radius 1 at each point, dipping to `param` between.
      const sector = TAU / m
      const t = (((theta % sector) + sector) % sector) / sector // 0..1 within a point
      const inner = param
      return inner + (1 - inner) * Math.abs(1 - 2 * t)
    }

    case 'flower':
      // Smooth m-petalled rose: a gentle cosine bulge.
      return 1 - param + param * (0.5 + 0.5 * Math.cos(m * theta))

    case 'superellipse': {
      // |x|^p + |y|^p = 1 in polar form; corners bulge past the axes (normalized away).
      const p = param
      const c = Math.abs(Math.cos(theta))
      const s = Math.abs(Math.sin(theta))
      const d = Math.pow(Math.pow(c, p) + Math.pow(s, p), 1 / p)
      return d > 1e-9 ? 1 / d : 1
    }

    case 'gear': {
      // Flat-topped m-tooth gear: a smoothed square wave (tanh plateaus).
      const k = 4
      const sq = Math.tanh(k * Math.cos(m * theta)) / Math.tanh(k)
      return 1 - param + param * (0.5 + 0.5 * sq)
    }

    case 'heart': {
      // Classic polar heart. Denominator (sinθ + 1.4) is always ≥ 0.4, so it never
      // divides by zero and stays single-valued. Cusp/notch sits at the top.
      const st = Math.sin(theta)
      const ct = Math.cos(theta)
      return 2 - 2 * st + (st * Math.sqrt(Math.abs(ct))) / (st + 1.4)
    }
  }
}

/** Radii of a shape sampled at θ_i = 2π·i/N, normalized so the max radius is 1. */
export function sampleShape(shape: Shape, n: number): Float64Array {
  const r = new Float64Array(n)
  let max = 0
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, radiusAt(shape, (i / n) * TAU))
    r[i] = v
    if (v > max) max = v
  }
  const inv = max > 1e-9 ? 1 / max : 1
  for (let i = 0; i < n; i++) r[i] *= inv
  return r
}

/** Linear-interpolate two equal-length radius arrays into `out` (allocation-free). */
export function morphRadii(a: Float64Array, b: Float64Array, t: number, out: Float64Array): Float64Array {
  const s = Math.min(1, Math.max(0, t))
  for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * s
  return out
}

/** Smoothstep easing — a soft ease-in-out so morphs start and settle gently. */
export function smoothstep(t: number): number {
  const s = Math.min(1, Math.max(0, t))
  return s * s * (3 - 2 * s)
}

/** Reconstruct outline points (unit scale) from a radius array, for tests / bbox. */
export function pointsFromRadii(r: Float64Array): { xs: Float64Array; ys: Float64Array } {
  const n = r.length
  const xs = new Float64Array(n)
  const ys = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    xs[i] = r[i] * Math.cos(a)
    ys[i] = r[i] * Math.sin(a)
  }
  return { xs, ys }
}

/** Build one concrete Shape of a given type with seeded, tasteful parameters. */
function makeShape(type: ShapeType, rng: () => number): Shape {
  const randInt = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))
  switch (type) {
    case 'circle': return { type, m: 0, param: 0 }
    case 'polygon': return { type, m: randInt(3, 8), param: 0 }
    case 'star': return { type, m: randInt(5, 9), param: 0.42 + rng() * 0.16 }
    case 'flower': return { type, m: randInt(3, 8), param: 0.3 + rng() * 0.15 }
    case 'superellipse': return { type, m: 0, param: 3 + rng() * 3 }
    case 'gear': return { type, m: randInt(7, 13), param: 0.18 + rng() * 0.1 }
    case 'heart': return { type, m: 0, param: 0 }
  }
}

/** Seeded, in-place Fisher–Yates shuffle. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Pick an ordered cycle of `count` distinct shapes (with seeded params) from the
 *  RNG. `count` is clamped to the number of available shape types. Deterministic. */
export function pickOrder(rng: () => number, count: number): Shape[] {
  const n = Math.max(2, Math.min(SHAPE_TYPES.length, Math.floor(count)))
  const types = shuffle(SHAPE_TYPES.slice(), rng).slice(0, n)
  return types.map((t) => makeShape(t, rng))
}

export { mulberry32 }
