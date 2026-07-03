import { mulberry32 } from '../../framework/rng'
import { sampleGradientRGBA } from '../../framework/gradient'

// Cap the sim grid's longest side. Each step does a full mip pyramid + a
// multi-scale pass, so keep it moderate. Isotropic (square) texels so mip-box
// blurs are round.
export const SIM_MAX_SIDE = 512

// Base multi-scale set (activator mip / inhibitor mip / step amount). Bigger mip =
// wider blur (mip L ≈ a 2^L box average). Ordered fine → coarse; the pixel picks
// whichever scale is locally smoothest and steps toward its activator/inhibitor.
export const BASE_SCALES = [
  { a: 0, i: 2, amt: 0.038 },
  { a: 1, i: 3, amt: 0.030 },
  { a: 2, i: 4, amt: 0.024 },
  { a: 3, i: 5, amt: 0.019 },
  { a: 4, i: 6, amt: 0.015 },
]

export function simDims(w: number, h: number): { sw: number; sh: number } {
  const longest = Math.max(w, h)
  const s = longest > SIM_MAX_SIDE ? SIM_MAX_SIDE / longest : 1
  return { sw: Math.max(1, Math.round(w * s)), sh: Math.max(1, Math.round(h * s)) }
}

/** Deterministic seeded starting field: small random noise in [-1,1] (stored in R). */
export function seedField(seed: number, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h * 4)
  const rng = mulberry32(seed)
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = rng() * 2 - 1
    out[i * 4 + 3] = 1
  }
  return out
}

/** Bake the value→color ramp (non-cyclic) into a 256×RGBA byte LUT. */
export function buildLUT(stops: string[]): Uint8Array {
  const lut = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    const c = sampleGradientRGBA(stops, i / 255)
    lut[i * 4 + 0] = Math.round(c.r)
    lut[i * 4 + 1] = Math.round(c.g)
    lut[i * 4 + 2] = Math.round(c.b)
    lut[i * 4 + 3] = 255
  }
  return lut
}

export type ScaleUniforms = { actLod: Float32Array; inhLod: Float32Array; amt: Float32Array; n: number }

/** Shift the base scale set coarser by `scale`, clamped to the field's mip range. */
export function computeScales(scale: number, maxLod: number): ScaleUniforms {
  const n = BASE_SCALES.length
  const actLod = new Float32Array(8)
  const inhLod = new Float32Array(8)
  const amt = new Float32Array(8)
  for (let i = 0; i < n; i++) {
    actLod[i] = Math.min(BASE_SCALES[i].a + scale, maxLod)
    inhLod[i] = Math.min(BASE_SCALES[i].i + scale, maxLod)
    amt[i] = BASE_SCALES[i].amt
  }
  return { actLod, inhLod, amt, n }
}
