import { sampleGradientRGBA } from '../../framework/gradient'

// Max territory hues the DISPLAY shader's uniform array holds (matches schema max).
export const MAX_HUES = 6

/** Sim grid, capped by gridResolution's longest side. Morphogen fields are SMOOTH,
 *  so a small grid upscales flawlessly with LINEAR — and small L relaxes to a clean
 *  gradient fast (crossing time ≈ L²/D). This is a distinctness lever vs Gray-Scott's
 *  640: the gradient is the ideal thing to stretch, so we never need a big field. */
export function simDims(w: number, h: number, gridResolution: number): { sw: number; sh: number } {
  const longest = Math.max(w, h)
  const s = longest > gridResolution ? gridResolution / longest : 1
  return { sw: Math.max(1, Math.round(w * s)), sh: Math.max(1, Math.round(h * s)) }
}

/** Bake the band ramp into a 256×RGBA byte LUT (uploaded as 256×1). Reused from the
 *  Gray-Scott approach: a continuous gradient is LUT(p), a discrete band is
 *  LUT((i+0.5)/bands). */
export function buildLUT(stops: string[]): Uint8Array {
  const s8 = stops.map((s) => (s.length === 7 ? s + 'ff' : s))
  const lut = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    const c = sampleGradientRGBA(s8, i / 255)
    lut[i * 4 + 0] = Math.round(c.r)
    lut[i * 4 + 1] = Math.round(c.g)
    lut[i * 4 + 2] = Math.round(c.b)
    lut[i * 4 + 3] = 255
  }
  return lut
}

/** Territory hues → a flat [r,g,b, r,g,b, …] Float32Array of length MAX_HUES*3, in
 *  0..1, for the DISPLAY shader's `u_terrCol` uniform. Colors are cycled to fill the
 *  array so an argmax index never reads uninitialized slots. */
export function buildTerritoryColors(hues: string[]): Float32Array {
  const out = new Float32Array(MAX_HUES * 3)
  for (let i = 0; i < MAX_HUES; i++) {
    const hex = hues[i % hues.length]
    const c = sampleGradientRGBA([hex.length === 7 ? hex + 'ff' : hex], 0)
    out[i * 3 + 0] = c.r / 255
    out[i * 3 + 1] = c.g / 255
    out[i * 3 + 2] = c.b / 255
  }
  return out
}

/** Decay k from the exposed `gradientReach` λ (fraction of the short screen dim):
 *  a source's steady gradient is ~exp(−r/λ), and λ = sqrt(D/k) in texels, so
 *  k = D / (λ·simMinSide)². D is the fixed diffusion (1.0, stable on the normalized
 *  9-pt stencil at dt=1). */
export function decayFromReach(reach: number, simMinSide: number): number {
  const D = 1.0
  const lambdaTexels = Math.max(2, reach * simMinSide)
  return D / (lambdaTexels * lambdaTexels)
}
