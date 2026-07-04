import { mulberry32 } from '../../framework/rng'

// CPU reference for the growth RULE the GPU model embodies (not a re-implementation
// of the Gray-Scott shader — a minimal 1-D interface that isolates the physics the
// whole diversion hinges on: the Mullins–Sekerka / Saffman–Taylor instability).
//
// A viscous-fingering front is UNSTABLE: a spot that pushes ahead of its neighbours
// feels a steeper pressure gradient and advances even faster (positive feedback),
// while surface tension — which penalizes sharp curvature — smooths the tip and
// sets the finger width. When the destabilizing feedback outruns the smoothing, a
// nearly-flat front amplifies its own roughness into fingers instead of relaxing to
// a smooth line. This module lets a test PROVE that: run the rule on an almost-flat
// front and the variance of its advance must GROW (fingers), where a pure-diffusion
// control (feedback off) instead shrinks it (a smooth disc). That distinguishes the
// intended instability from a smooth expanding front or from static noise.

export interface FrontParams {
  /** Destabilizing positive feedback: a protrusion's excess advance ∝ how far it
   *  leads its neighbours. Larger = stronger fingering drive. */
  feedback: number
  /** Surface tension: curvature smoothing that damps short-wavelength roughness. */
  tension: number
  /** Per-step multiplicative micro-perturbation amplitude (seeds tip-splitting). */
  noise: number
  /** Integration step. */
  dt: number
}

/** One update of a periodic 1-D interface `h` (returns a new array). Discrete
 *  curvature `lap = h[i-1] - 2h[i] + h[i+1]`; the protrusion of a cell above its
 *  neighbours is `-0.5·lap`, so the net curvature response is
 *  `(tension - 0.5·feedback)·lap`: when feedback > 2·tension the sign flips and the
 *  front is linearly unstable. A base outward drive advances the mean front. */
export function stepFront(h: number[], p: FrontParams, rand: () => number): number[] {
  const n = h.length
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const hl = h[(i - 1 + n) % n]
    const hr = h[(i + 1) % n]
    const lap = hl - 2 * h[i] + hr
    const protrusion = -0.5 * lap // >0 where this cell leads its neighbours
    const drive = 1.0 + p.feedback * protrusion // positive feedback on protrusions
    const smoothing = p.tension * lap // relaxes curvature
    const perturb = 1.0 + p.noise * (rand() * 2 - 1)
    out[i] = h[i] + p.dt * (drive * perturb + smoothing)
  }
  return out
}

/** Population variance of an array (spread of the front — its "fingeriness"). */
export function variance(h: number[]): number {
  const n = h.length
  let m = 0
  for (const v of h) m += v
  m /= n
  let s = 0
  for (const v of h) s += (v - m) * (v - m)
  return s / n
}

/** Run `steps` of `stepFront` from an almost-flat seeded front; report how the
 *  front-roughness variance changed. `startVar`→`endVar` growing means the rule
 *  fingered (unstable); shrinking means it smoothed (stable). Deterministic per seed. */
export function runFront(
  n: number,
  steps: number,
  p: FrontParams,
  seed: number,
): { startVar: number; endVar: number; front: number[] } {
  const rng = mulberry32(seed)
  let h = new Array<number>(n)
  for (let i = 0; i < n; i++) h[i] = (rng() * 2 - 1) * 1e-3 // near-flat + tiny roughness
  const startVar = variance(h)
  for (let s = 0; s < steps; s++) h = stepFront(h, p, rng)
  return { startVar, endVar: variance(h), front: h }
}
