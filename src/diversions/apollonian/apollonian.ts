// Apollonian gasket — clean-room port of xscreensaver's `apollonian` hack by
// Jamie Zawinski (after Allan Wechsler / the original by "the author" in the
// hacks/apollonian.c header). We recursively pack mutually-tangent circles into
// every curvilinear gap using the Descartes Circle Theorem:
//
//     (k1 + k2 + k3 + k4)^2 = 2 (k1^2 + k2^2 + k3^2 + k4^2)
//
// and its complex extension for the centres (with zi the complex centre of
// circle i and ki its SIGNED curvature — the bounding circle has negative k):
//
//     (k1 z1 + k2 z2 + k3 z3 + k4 z4)^2 = 2 (k1^2 z1^2 + ... + k4^2 z4^2)
//
// The whole gasket is generated with ZERO floating-point drift once we have a
// valid starting quadruple, because the recursion is the exact "pollinate" step
//     k4' = 2(k1 + k2 + k3) - k4          (the OTHER Descartes solution)
//     (k4' z4') = 2(k1 z1 + k2 z2 + k3 z3) - (k4 z4)
// i.e. reflecting one circle of a tangent quadruple through the other three.
// The complex square root is needed ONLY to place the seed quadruple.

/** A circle in gasket space (the bounding circle is normalised to radius 1 at
 *  the origin). `k` is the signed curvature (1/radius); the outer circle's is
 *  negative. `depth` is the recursion generation (0 = seed circles), used to
 *  order the reveal + drive depth colouring. */
export interface Circle {
  x: number
  y: number
  k: number // signed curvature; radius = 1 / |k|
  depth: number
}

// ─── Tiny complex arithmetic (only the seed solver needs it) ──────────────────
interface Cx { re: number; im: number }
const cAdd = (a: Cx, b: Cx): Cx => ({ re: a.re + b.re, im: a.im + b.im })
const cMul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
const cScale = (a: Cx, s: number): Cx => ({ re: a.re * s, im: a.im * s })
/** Principal complex square root. */
function cSqrt(w: Cx): Cx {
  const r = Math.hypot(w.re, w.im)
  const re = Math.sqrt(Math.max(0, (r + w.re) / 2))
  let im = Math.sqrt(Math.max(0, (r - w.re) / 2))
  if (w.im < 0) im = -im
  return { re, im }
}

// ─── Seed families ────────────────────────────────────────────────────────────
// Each is a "root Descartes quadruple" (b0, b1, b2, b3) with b0 < 0 the bounding
// circle. Integer quadruples give the classic self-similar integer gaskets; the
// first (irrational) one is the perfectly 3-fold-symmetric gasket. We normalise
// so the bounding circle has radius 1 (k0 = -1) before placing anything, so
// every family shares one "detail" (min-radius) scale.
const S = 2 * Math.sqrt(3) / 3 // ≈1.1547 — the symmetric inner curvature (1 ± S)
export const SEED_FAMILIES: [number, number, number, number][] = [
  [-1, 1 + S, 1 + S, 1 + S], // perfect 3-fold symmetry (the iconic gasket)
  [-1, 2, 2, 3], // bilateral — two big lobes
  [-2, 3, 6, 7],
  [-3, 4, 12, 13],
  [-3, 5, 8, 8],
  [-4, 8, 9, 9],
  [-6, 10, 15, 19],
  [-6, 11, 14, 15],
  [-7, 12, 17, 20],
]

/** Verify a quadruple satisfies the Descartes Circle Theorem (test hook). */
export function descartesResidual(k0: number, k1: number, k2: number, k3: number): number {
  const lhs = (k0 + k1 + k2 + k3) ** 2
  const rhs = 2 * (k0 * k0 + k1 * k1 + k2 * k2 + k3 * k3)
  return Math.abs(lhs - rhs)
}

/** Place the four seed circles of a family, normalised so the bounding circle is
 *  radius 1 at the origin. Returns them tagged depth 0. Uses the complex Descartes
 *  theorem to place the fourth circle. */
function seedQuadruple(family: [number, number, number, number]): Circle[] {
  const [b0, b1, b2, b3] = family
  const scale = 1 / Math.abs(b0) // normalise outer to radius 1 (k0 = -1)
  const k0 = -1
  const k1 = b1 * scale
  const k2 = b2 * scale
  const k3 = b3 * scale
  const r1 = 1 / k1
  const r2 = 1 / k2
  const r3 = 1 / k3

  // c0: bounding circle at origin, radius 1.
  const z0: Cx = { re: 0, im: 0 }
  // c1: internally tangent to the outer circle, on the +x axis.
  const z1: Cx = { re: 1 - r1, im: 0 }
  // c2: internally tangent to outer, externally tangent to c1 (pick +y solution).
  const a = z1.re
  const d1 = 1 - r2 // distance from origin
  const d2 = r1 + r2 // distance from c1
  const x2 = (a * a + d1 * d1 - d2 * d2) / (2 * a)
  const y2 = Math.sqrt(Math.max(0, d1 * d1 - x2 * x2))
  const z2: Cx = { re: x2, im: y2 }

  // c3: complex Descartes from (c0, c1, c2). With z0 = 0 the sqrt term collapses
  // to k1 k2 z1 z2. Two solutions (±); pick the one tangent+nested correctly.
  const kz1 = cScale(z1, k1)
  const kz2 = cScale(z2, k2)
  const base = cAdd(kz1, kz2) // k0 z0 = 0
  const root = cSqrt(cMul(cScale(z1, k1), cScale(z2, k2)))
  const solve = (sign: number): Circle => {
    const kz3 = cAdd(base, cScale(root, 2 * sign))
    return { x: kz3.re / k3, y: kz3.im / k3, k: k3, depth: 0 }
  }
  const cand = [solve(+1), solve(-1)]
  // Correct fourth circle: internally inside the bounding circle (|z3| ≈ 1 - r3)
  // AND externally tangent to c1 and c2.
  const good = (c: Circle): number => {
    const inOuter = Math.abs(Math.hypot(c.x, c.y) - (1 - r3))
    const t1 = Math.abs(Math.hypot(c.x - z1.re, c.y - z1.im) - (r3 + r1))
    const t2 = Math.abs(Math.hypot(c.x - z2.re, c.y - z2.im) - (r3 + r2))
    return inOuter + t1 + t2
  }
  const z3c = good(cand[0]) <= good(cand[1]) ? cand[0] : cand[1]

  return [
    { x: z0.re, y: z0.im, k: k0, depth: 0 },
    { x: z1.re, y: z1.im, k: k1, depth: 0 },
    { x: z2.re, y: z2.im, k: k2, depth: 0 },
    z3c,
  ]
}

/** Reflect one circle of a tangent quadruple through the other three — the exact
 *  "pollinate" step. Given the three kept circles and the one being replaced,
 *  returns the OTHER circle tangent to all three. */
function pollinate(a: Circle, b: Circle, c: Circle, replaced: Circle, depth: number): Circle {
  const k = 2 * (a.k + b.k + c.k) - replaced.k
  // work in curvature-weighted centres (P = k·z) so no division until the end
  const px = 2 * (a.k * a.x + b.k * b.x + c.k * c.x) - replaced.k * replaced.x
  const py = 2 * (a.k * a.y + b.k * b.y + c.k * c.y) - replaced.k * replaced.y
  return { x: px / k, y: py / k, k, depth }
}

export interface GasketOptions {
  /** Cull once curvature exceeds this (circles smaller than 1/maxCurvature of the
   *  bounding circle are dropped). Higher = finer detail = more circles. */
  maxCurvature: number
  /** Hard safety cap on total circles (protects the frame budget). */
  maxCircles: number
}

/** Generate the full gasket for a seed family, sorted for reveal (bounding
 *  circle first, then by depth, then largest-first within a depth). */
export function buildGasket(familyIndex: number, opts: GasketOptions): Circle[] {
  const family = SEED_FAMILIES[((familyIndex % SEED_FAMILIES.length) + SEED_FAMILIES.length) % SEED_FAMILIES.length]
  const seed = seedQuadruple(family)
  const out: Circle[] = [...seed]
  const [c0, c1, c2, c3] = seed

  const keep = (c: Circle): boolean =>
    c.k > 0 && c.k <= opts.maxCurvature && out.length < opts.maxCircles

  // Recurse a mutually-tangent quadruple (a,b,c,newest): each of the three
  // non-newest circles can be reflected through the other three to spawn a fresh
  // circle in a new gap. Reflecting `newest` would regenerate the parent, so skip.
  const recurse = (a: Circle, b: Circle, cc: Circle, newest: Circle): void => {
    if (out.length >= opts.maxCircles) return
    const triples: [Circle, Circle, Circle, Circle][] = [
      [b, cc, newest, a],
      [a, cc, newest, b],
      [a, b, newest, cc],
    ]
    for (const [p, q, r, replaced] of triples) {
      const nc = pollinate(p, q, r, replaced, newest.depth + 1)
      if (!keep(nc)) continue
      out.push(nc)
      recurse(p, q, r, nc)
    }
  }

  // Seed the four first-generation gaps: reflect each seed circle (including the
  // bounding circle, whose reflection is the central circle) through the others.
  const firstGen: [Circle, Circle, Circle, Circle][] = [
    [c1, c2, c3, c0],
    [c0, c2, c3, c1],
    [c0, c1, c3, c2],
    [c0, c1, c2, c3],
  ]
  for (const [p, q, r, replaced] of firstGen) {
    const nc = pollinate(p, q, r, replaced, 1)
    if (!keep(nc)) continue
    out.push(nc)
    recurse(p, q, r, nc)
  }

  // Reveal order: bounding circle first, then shallow→deep, largest→smallest.
  out.sort((u, v) => (u.depth - v.depth) || (Math.abs(u.k) - Math.abs(v.k)))
  return out
}
