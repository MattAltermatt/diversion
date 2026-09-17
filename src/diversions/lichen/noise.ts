// Noise for Lichen, DERIVED from the framework's canonical RNG rather than hand-rolled.
//
// `src/framework/rng.ts` is the shared home for the seeded PRNG and value noise; diversions
// import from it and never keep a private copy. The design probe ignored that and hand-rolled
// a hash using `h ^ (h >> 16)` — an ARITHMETIC shift, which sign-extends, so bit 31 was always
// cleared and the hash returned [0, 0.5) instead of [0, 1). Every field built on it was
// half-scale, which showed up as three apparently unrelated defects: storm survivors at 17%
// against a documented 8.5%, a growth `lobe` spanning 0.62-0.81 instead of 0.62-1.00, and the
// `relief` field centred on 0.25 so its "ridges shed water" half never happened at all.
//
// The only new arithmetic here is the [-1,1] -> [0,1] remap, and that is what the tests target.

import { makeNoise3D, mulberry32 } from '../../framework/rng'

/** Seeded PRNG -> () => float in [0, 1). */
export const makeRng = mulberry32

export type Noise2D = (x: number, y: number) => number

/** Seeded 2D value noise in [-1, 1], a fixed-z slice of the framework's 3D field. */
export function makeNoise2D(seed: number): Noise2D {
  const n3 = makeNoise3D(seed)
  return (x, y) => n3(x, y, 0.5)
}

/** Fractal sum of `noise`, remapped to [0, 1]. */
export function fbm2(noise: Noise2D, x: number, y: number, octaves: number): number {
  let sum = 0, amp = 0.5, freq = 1, norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return Math.min(1, Math.max(0, (sum / norm) * 0.5 + 0.5))
}
