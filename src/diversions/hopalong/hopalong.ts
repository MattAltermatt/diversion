// Clean-room reimplementation of Barry Martin's Hopalong map (and two named
// cousins from the same family) after xscreensaver's `hopalong` hack
// (hacks/hopalong.c, in the `hop` xlockmore module — credited there to
// Patrick J. Naughton / Barry Martin / Ed Kubaitis / Renaldo Recuerdo).
// Source consulted: https://github.com/Zygo/xscreensaver/blob/master/hacks/hopalong.c
// No original C was copied — the math below is rederived from the published
// recurrences and reimplemented in TypeScript against this repo's own
// rejection-sampling / drift / screen-fit conventions (see strange-attractors).
//
// martin — Barry Martin's original "sqrt hop":
//   x' = y − sign(x)·√|b·x − c|,  y' = a − x
// sine  — Martin's simpler sine cousin ("Martin2" in the source):
//   x' = y − sin(x),  y' = a − x
// rr    — Renaldo Recuerdo's generalized-exponent cousin:
//   x' = y − sign(x)·|b·x − c|^d,  y' = a − x
//
// All three are plotted through the same diamond-rotated screen mapping the
// original uses: screenX = cx + (x+y)·scale, screenY = cy − (x−y)·scale.
import { mulberry32 } from '../../framework/rng'

export type HopalongMap = 'martin' | 'sine' | 'rr'
export interface Coeffs { a: number; b: number; c: number; d: number }

type StepFn = (x: number, y: number, c: Coeffs) => { x: number; y: number }

export const MAPS: Record<HopalongMap, StepFn> = {
  martin: (x, y, c) => {
    const ny = c.a - x
    const term = Math.sqrt(Math.abs(c.b * x - c.c))
    const nx = y + (x < 0 ? term : -term)
    return { x: nx, y: ny }
  },
  sine: (x, y, c) => {
    const ny = c.a - x
    const nx = y - Math.sin(x)
    return { x: nx, y: ny }
  },
  rr: (x, y, c) => {
    const ny = c.a - x
    const term = Math.pow(Math.abs(c.b * x - c.c), c.d)
    const nx = y - (x < 0 ? -term : term)
    return { x: nx, y: ny }
  },
}

// Curated known-good coefficient sets — the guaranteed fallback when
// rejection sampling exhausts its tries. Each is a hand-verified bounded,
// non-degenerate orbit (see hopalong.test.ts).
export const FALLBACK: Record<HopalongMap, Coeffs> = {
  martin: { a: 2, b: 1, c: 0, d: 0 },
  sine: { a: Math.PI + 0.4, b: 0, c: 0, d: 0 },
  rr: { a: 1.5, b: 1, c: 0.3, d: 0.4 },
}

// Per-map draw ranges, tuned empirically (see scratch exploration) for a
// high rejection-sampling hit rate with varied, interesting orbits.
function drawCoeffs(kind: HopalongMap, rng: () => number): Coeffs {
  const signed = (r: number) => (rng() * 2 - 1) * r
  switch (kind) {
    case 'martin':
      return { a: signed(3), b: signed(3), c: signed(3), d: 0 }
    case 'sine':
      return { a: Math.PI + signed(1.2), b: 0, c: 0, d: 0 }
    case 'rr':
      return { a: signed(2), b: signed(2), c: signed(2), d: 0.15 + rng() * 0.4 }
  }
}

const MAG_GUARD = 1e4 // reject a diverging orbit before it hits Infinity
const SPREAD_MIN = 0.5 // below this the orbit collapsed to a point / short cycle
const SPREAD_MAX = 220 // above this it's blown out too far to auto-fit nicely
const WARMUP = 3000
const WARMUP_SKIP = 200 // ignore the initial transient when measuring extent

/** Integrate a warmup run and measure the orbit's bounding box in the
 *  diamond-rotated screen basis (u = x+y, v = x−y — the axes the renderer
 *  actually plots in). Returns null for a diverging / collapsed / blown-out
 *  orbit; otherwise the half-extent used to auto-fit the view. */
export function measureOrbit(kind: HopalongMap, c: Coeffs): { halfExtent: number } | null {
  const step = MAPS[kind]
  let x = 0.1, y = 0.1
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (let i = 0; i < WARMUP; i++) {
    const n = step(x, y, c); x = n.x; y = n.y
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    if (Math.abs(x) > MAG_GUARD || Math.abs(y) > MAG_GUARD) return null
    if (i > WARMUP_SKIP) {
      const u = x + y, v = x - y
      if (u < minU) minU = u; if (u > maxU) maxU = u
      if (v < minV) minV = v; if (v > maxV) maxV = v
    }
  }
  const spread = (maxU - minU) + (maxV - minV)
  if (spread < SPREAD_MIN || spread > SPREAD_MAX) return null
  const halfExtent = Math.max(Math.abs(minU), Math.abs(maxU), Math.abs(minV), Math.abs(maxV))
  return { halfExtent }
}

export function isValidOrbit(kind: HopalongMap, c: Coeffs): boolean {
  return measureOrbit(kind, c) !== null
}

/** seed → first valid coefficient set + its auto-fit half-extent (cap 40
 *  tries → curated fallback, whose extent is measured the same way). */
export function sampleCoeffs(kind: HopalongMap, seed: number): { coeffs: Coeffs; halfExtent: number } {
  const rng = mulberry32(seed >>> 0)
  for (let i = 0; i < 40; i++) {
    const coeffs = drawCoeffs(kind, rng)
    const m = measureOrbit(kind, coeffs)
    if (m) return { coeffs, halfExtent: m.halfExtent }
  }
  const coeffs = { ...FALLBACK[kind] }
  const m = measureOrbit(kind, coeffs)
  return { coeffs, halfExtent: m ? m.halfExtent : 10 } // m is always non-null for FALLBACK
}

// Per-map drift amplitude (world units) at drift=1 — how far coefficients
// wobble from base. 'sine' only has one live coefficient (a); 'rr' keeps its
// exponent (d) wobbling gently to avoid destabilizing the power term.
const DRIFT_RATE = 0.00022 // rad/ms at drift=1 — slow, zen
const FREQS = [1.0, 1.31, 1.73, 2.11] as const // incommensurate → quasi-periodic
const DRIFT_AMP: Record<HopalongMap, Coeffs> = {
  martin: { a: 0.4, b: 0.4, c: 0.4, d: 0 },
  sine: { a: 0.3, b: 0, c: 0, d: 0 },
  rr: { a: 0.3, b: 0.3, c: 0.3, d: 0.06 },
}

/** Sinusoidal wobble around base, bounded by DRIFT_AMP·drift for every t —
 *  a rare excursion outside the validated range self-heals via the frame
 *  loop's NaN guard rather than ever diverging outright. drift=0 → frozen. */
export function driftedCoeffs(kind: HopalongMap, base: Coeffs, t: number, drift: number): Coeffs {
  if (drift === 0) return base
  const amp = DRIFT_AMP[kind]
  const w = t * DRIFT_RATE
  return {
    a: base.a + amp.a * drift * Math.sin(w * FREQS[0]),
    b: base.b + amp.b * drift * Math.sin(w * FREQS[1]),
    c: base.c + amp.c * drift * Math.sin(w * FREQS[2]),
    d: base.d + amp.d * drift * Math.sin(w * FREQS[3]),
  }
}

/** Pixels per world unit: fit halfExtent into ~90% of the min dimension.
 *  Fixed per (map, seed) — not re-measured during drift — so there's no
 *  jittery breathing zoom. */
export function screenScale(halfExtent: number, w: number, h: number): number {
  const minDim = Math.min(w, h)
  return (minDim * 0.45) / Math.max(halfExtent, 1e-6)
}
