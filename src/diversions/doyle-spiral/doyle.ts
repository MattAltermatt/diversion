// Doyle spiral numerics — a clean-room TypeScript port of Robin Houston's 2013
// reference (gist 6096562). A Doyle spiral of type (p,q) is a hexagonal packing
// of mutually-tangent circles whose radii form a doubly-infinite geometric
// sequence, so the whole thing is invariant under one complex "scale+rotate"
// generator `a` — the discrete analogue of the complex exponential map. That
// self-similarity is what lets us flow it seamlessly forever (see index.ts).
//
// The construction: find polar params (z,t) of the primary generator `a` by 2-D
// Newton–Raphson so three touching-circle radius-ratios agree, then the lattice
// of centres is aᵐ·bⁿ with each circle's radius = |centre|·r.

const { pow, sin, cos, sqrt } = Math
const PI = Math.PI

// ─── The radius-ratio system and its exact partials (verbatim math from Houston) ──
// _d = squared distance between z·e^{it} and (z·e^{it})^{p/q}; _s = squared sum of
// their origin-distances; _r = _d/_s = squared radius-ratio of two touching circles
// centred there. A valid generator makes _r via the (0,1), (p,q) and coroot steps
// all equal.
function _d(z: number, t: number, p: number, q: number): number {
  const w = pow(z, p / q)
  const s = (p * t + 2 * PI) / q
  return (z * cos(t) - w * cos(s)) ** 2 + (z * sin(t) - w * sin(s)) ** 2
}
function ddz_d(z: number, t: number, p: number, q: number): number {
  const w = pow(z, p / q)
  const s = (p * t + 2 * PI) / q
  const dw = (p / q) * pow(z, (p - q) / q)
  return 2 * (w * cos(s) - z * cos(t)) * (dw * cos(s) - cos(t))
    + 2 * (w * sin(s) - z * sin(t)) * (dw * sin(s) - sin(t))
}
function ddt_d(z: number, t: number, p: number, q: number): number {
  const w = pow(z, p / q)
  const s = (p * t + 2 * PI) / q
  const dst = p / q
  return 2 * (z * cos(t) - w * cos(s)) * (-z * sin(t) + w * sin(s) * dst)
    + 2 * (z * sin(t) - w * sin(s)) * (z * cos(t) - w * cos(s) * dst)
}
function _s(z: number, _t: number, p: number, q: number): number {
  return (z + pow(z, p / q)) ** 2
}
function ddz_s(z: number, _t: number, p: number, q: number): number {
  const w = pow(z, p / q)
  const dw = (p / q) * pow(z, (p - q) / q)
  return 2 * (w + z) * (dw + 1)
}
function _r(z: number, t: number, p: number, q: number): number {
  return _d(z, t, p, q) / _s(z, t, p, q)
}
function ddz_r(z: number, t: number, p: number, q: number): number {
  return (ddz_d(z, t, p, q) * _s(z, t, p, q) - _d(z, t, p, q) * ddz_s(z, t, p, q)) / _s(z, t, p, q) ** 2
}
function ddt_r(z: number, t: number, p: number, q: number): number {
  return (ddt_d(z, t, p, q) * _s(z, t, p, q)) / _s(z, t, p, q) ** 2
}

export interface DoyleGenerators {
  /** Primary generator `a` (complex, [re, im]); the lattice steps by ×a. */
  a: [number, number]
  /** Secondary generator `b` (complex) — offsets the q rotated arms. */
  b: [number, number]
  /** Radius ratio: a circle centred at complex `c` has radius |c|·r. */
  r: number
  /** Modulus and argument of `a` (its polar form) — drives the flow transform. */
  modA: number
  argA: number
}

const EPS = 1e-10

/** Solve the Doyle spiral generators for type (p,q) by 2-D Newton–Raphson, from
 *  the seed (z,t)=(2,0). Returns null if it fails to converge (degenerate p,q). */
export function solveDoyle(p: number, q: number): DoyleGenerators | null {
  const f = (z: number, t: number) => _r(z, t, 0, 1) - _r(z, t, p, q)
  const ddz_f = (z: number, t: number) => ddz_r(z, t, 0, 1) - ddz_r(z, t, p, q)
  const ddt_f = (z: number, t: number) => ddt_r(z, t, 0, 1) - ddt_r(z, t, p, q)
  const g = (z: number, t: number) => _r(z, t, 0, 1) - _r(pow(z, p / q), (p * t + 2 * PI) / q, 0, 1)
  const ddz_g = (z: number, t: number) =>
    ddz_r(z, t, 0, 1) - ddz_r(pow(z, p / q), (p * t + 2 * PI) / q, 0, 1) * (p / q) * pow(z, (p - q) / q)
  const ddt_g = (z: number, t: number) =>
    ddt_r(z, t, 0, 1) - ddt_r(pow(z, p / q), (p * t + 2 * PI) / q, 0, 1) * (p / q)

  let z = 2
  let t = 0
  for (let iter = 0; iter < 100; iter++) {
    const vf = f(z, t)
    const vg = g(z, t)
    if (vf > -EPS && vf < EPS && vg > -EPS && vg < EPS) {
      const modA = z
      const argA = t
      const corootZ = pow(z, p / q)
      const corootT = (p * t + 2 * PI) / q
      return {
        a: [z * cos(t), z * sin(t)],
        b: [corootZ * cos(corootT), corootZ * sin(corootT)],
        r: sqrt(_r(z, t, 0, 1)),
        modA,
        argA,
      }
    }
    const aa = ddz_f(z, t)
    const bb = ddt_f(z, t)
    const cc = ddz_g(z, t)
    const dd = ddt_g(z, t)
    const det = aa * dd - bb * cc
    if (det > -EPS && det < EPS) return null
    z -= (dd * vf - bb * vg) / det
    t -= (aa * vg - cc * vf) / det
    if (z < EPS) return null
  }
  return null
}

export interface DoyleCircle {
  /** Centre in normalised spiral space (unit-ish; scaled to px at draw time). */
  x: number
  y: number
  /** Radius in the same normalised space (= hypot(x,y)·r). */
  rad: number
  /** Which of the q rotated arms this circle belongs to (0..q−1) — for arm colour. */
  arm: number
}

/** Complex multiply. */
function cmul(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
}

/** Build the Doyle lattice covering the radius band [rInner, rOuter] (normalised).
 *  Centres are aᵐ·bⁿ (n=0..q−1); we walk m outward (×a) and inward (÷a) from each
 *  arm's start until we leave the band. Radius of each = |centre|·r. `maxCircles`
 *  caps the total: tight spirals (modA→1 as p→q) pack very many circles per turn,
 *  so we bound each walk to keep the q arms balanced and the frame budget safe. */
export function buildLattice(
  gen: DoyleGenerators,
  q: number,
  rInner: number,
  rOuter: number,
  maxCircles: number,
): DoyleCircle[] {
  const out: DoyleCircle[] = []
  const { a, b, r } = gen
  const modA = gen.modA
  const stepCap = Math.max(4, Math.floor(maxCircles / (2 * q))) // per-walk bound (in + out per arm)
  // reciprocal of a for the inward walk
  const inv: [number, number] = [a[0] / (modA * modA), -a[1] / (modA * modA)]
  let start: [number, number] = [...a] as [number, number]
  for (let n = 0; n < q; n++) {
    // outward from `start`: pos = start·aᵏ, k = 0,1,2,…
    let pos: [number, number] = [...start] as [number, number]
    let mod = Math.hypot(pos[0], pos[1])
    for (let k = 0; k < stepCap && mod < rOuter; k++) {
      if (mod > rInner) out.push({ x: pos[0], y: pos[1], rad: mod * r, arm: n })
      pos = cmul(pos, a)
      mod *= modA
    }
    // inward: pos = start·a⁻ᵏ, k = 1,2,…
    pos = cmul(start, inv)
    mod = Math.hypot(pos[0], pos[1])
    for (let k = 0; k < stepCap && mod > rInner; k++) {
      if (mod < rOuter) out.push({ x: pos[0], y: pos[1], rad: mod * r, arm: n })
      pos = cmul(pos, inv)
      mod /= modA
    }
    start = cmul(start, b)
  }
  return out
}
