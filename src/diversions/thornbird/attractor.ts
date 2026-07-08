import { mulberry32 } from '../../framework/rng'

// After xscreensaver's `thornbird` hack (Tim Auckland, 1996, "Bird in a
// Thornbush", adapted from his `discrete.c`) / Clifford Pickover's family of
// iterated-map "strange attractor" scatter plots. Clean-room TypeScript port —
// no GPL source copied — of the recurrence confirmed from the real
// `hacks/thornbird.c` (`draw_thornbird()`, xscreensaver/xlockmore source):
//
//   oldj = j;  oldi = i;
//   j' = oldi;
//   i' = (1 - c) * cos(PI * a * oldj) + c * b;
//   b' = oldj;
//
// i.e. a 3-tap delay map on a single scalar sequence:
//   x_{n+1} = (1 - c) * cos(pi * a * x_{n-1}) + c * x_{n-2}
// The source projects the 3-tuple (i, j, b) through a slowly tumbling 3D
// camera; this port instead plots consecutive iterates (x_n, x_{n+1})
// directly in 2D — the classic Pickover-style delay-embedding scatter plot of
// a 1D map, which is where the filamentary "bird" shape lives, and matches
// the low-alpha additive density-plot approach used across the gallery's
// other strange-attractor pieces.

export interface ThornbirdParams { a: number; c: number }
export interface ThornbirdPoint { x: number; y: number; z: number }

// Safety clamp for the feedback coefficient. Because (1-c) + c === 1, any
// state with |x|,|y|,|z| <= 1 stays inside [-1, 1] forever as long as
// 0 <= c < 1 at *every* step — true even though c is slowly time-varying
// (the induction only needs the per-step bound, not a fixed c). Verified
// numerically across this diversion's full paramC/drift range: without the
// clamp, paramC + drift's wobble amplitude can transiently push c above 1
// and the recurrence blows up to Infinity within a few thousand iterations.
const C_MAX = 0.98

/** One iteration of the confirmed thornbird recurrence. */
export function step(p: ThornbirdPoint, params: ThornbirdParams): ThornbirdPoint {
  const c = params.c < 0 ? 0 : params.c > C_MAX ? C_MAX : params.c
  const nx = (1 - c) * Math.cos(Math.PI * params.a * p.y) + c * p.z
  return { x: nx, y: p.x, z: p.y }
}

// Same starting point the source uses (hp->i = hp->j = hp->b = 0.1).
export const INITIAL_POINT: ThornbirdPoint = { x: 0.1, y: 0.1, z: 0.1 }

export interface DriftFreqs { t1: number; t2: number } // wobble periods, ms

/** seed -> the two incommensurate wobble periods (ms) that pace the slow A/C
 *  breathing — mirrors the source's per-screen random `liss.f1`/`liss.f2`. */
export function sampleFreqs(seed: number): DriftFreqs {
  const rng = mulberry32(seed >>> 0)
  return {
    t1: 20000 + rng() * 40000, // 20-60s
    t2: 8000 + rng() * 20000, // 8-28s
  }
}

// Matches the source's wobble amplitudes: `a` gets 0.4/0.05, `c` gets 0.15/0.05,
// and both share the same pair of frequencies (just different phase/amplitude) —
// the coupled Lissajous-style wobble that keeps the bird shape continuously
// breathing without ever repeating exactly.
const AMP_A1 = 0.4, AMP_A2 = 0.05
const AMP_C1 = 0.15, AMP_C2 = 0.05

/** Slowly wobble (baseA, baseC) around their base values. drift=0 -> frozen
 *  at the exact base values for any t (matches strange-attractors' idiom). */
export function driftedParams(
  baseA: number, baseC: number, freqs: DriftFreqs, t: number, drift: number,
): ThornbirdParams {
  if (drift === 0) return { a: baseA, c: baseC }
  const w1 = (2 * Math.PI * t) / freqs.t1
  const w2 = (2 * Math.PI * t) / freqs.t2
  return {
    a: baseA + drift * (AMP_A1 * Math.sin(w1) + AMP_A2 * Math.cos(w2)),
    c: baseC + drift * (AMP_C1 * Math.cos(w1) + AMP_C2 * Math.sin(w2)),
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Map a plotted point's screen position to t in [0,1] for color (mirrors
 *  strange-attractors' attractorColorT). */
export function thornbirdColorT(
  source: 'radius' | 'x' | 'y',
  sx: number, sy: number, cx: number, cy: number, maxR: number, w: number, h: number,
): number {
  if (source === 'x') return clamp01(sx / w)
  if (source === 'y') return clamp01(sy / h)
  return clamp01(Math.hypot(sx - cx, sy - cy) / maxR)
}

// The map is provably bounded within [-1, 1] (see step()'s doc) — fit that
// into 90% of the min screen dimension. Fixed (not auto-fit), so there's no
// jittery breathing zoom.
const WORLD_RADIUS = 1.05
export function screenScale(w: number, h: number): number {
  return (Math.min(w, h) * 0.45) / WORLD_RADIUS
}
