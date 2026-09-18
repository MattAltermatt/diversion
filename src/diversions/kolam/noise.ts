import { makeNoise3D } from '../../framework/rng'

/** x is sampled finer than y by this ratio, so the ground's bands elongate
 *  DOWNWARD. Taken from the probe's CODE — it spans 17 units across the width
 *  against 15 down the height — and not from its comment, which says
 *  "x ~3.4x coarser… bands run across the frame" and is wrong in both
 *  magnitude and direction. */
export const ANISO = 17 / 15

/** `makeNoise3D` returns [-1, 1]; remap to [0, 1). Getting this wrong halves
 *  every field, and the bug surfaces as several findings that look unrelated. */
export function unitNoise(seed: number): (x: number, y: number) => number {
  const n = makeNoise3D(seed)
  return (x, y) => (n(x, y, 0) + 1) * 0.5
}

export function makeFbm(seed: number, octaves = 4): (x: number, y: number) => number {
  const n = unitNoise(seed)
  return (x, y) => {
    let sum = 0, amp = 0.5, norm = 0, fx = x, fy = y
    for (let o = 0; o < octaves; o++) {
      sum += n(fx, fy) * amp
      norm += amp
      amp *= 0.5
      fx *= 2.03
      fy *= 1.97
    }
    return sum / norm
  }
}

/** fbm → DOMAIN WARP → sin(). The warp is what makes the bands braid rather
 *  than merely wobble; without it the ground reads as machined grain. */
export function warpedBands(seed: number): (x: number, y: number) => number {
  const base = makeFbm(seed)
  const wa = makeFbm(seed ^ 0x85ebca6b)
  const wb = makeFbm(seed ^ 0xc2b2ae35)
  const WARP = 2.1, BANDS = 3.2
  return (x, y) => {
    const ax = x * ANISO
    const ox = (wa(ax + 11.3, y + 7.7) - 0.5) * WARP
    const oy = (wb(ax + 3.1, y + 19.4) - 0.5) * WARP
    const f = base(ax + ox, y + oy)
    const band = Math.sin(f * BANDS * Math.PI * 2)
    return Math.sign(band) * Math.pow(Math.abs(band), 1.7)
  }
}
