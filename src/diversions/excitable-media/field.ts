import { mulberry32 } from '../../framework/rng'
import { sampleGradientRGBA } from '../../framework/gradient'

// Cap the sim grid's longest side. Cost is O(cells × simSpeed). 560 keeps the
// step cheap on retina while giving a fine field of spirals; the display pass
// smoothly upsamples the intensity channel so cells never read as blocky.
// Feature size (spiral count) scales with this — a 🎚️ tunable (confirm at verify).
export const SIM_MAX_SIDE = 560

export function simDims(w: number, h: number): { sw: number; sh: number } {
  const longest = Math.max(w, h)
  const s = longest > SIM_MAX_SIDE ? SIM_MAX_SIDE / longest : 1
  return { sw: Math.max(1, Math.round(w * s)), sh: Math.max(1, Math.round(h * s)) }
}

/** Display intensity of a hodgepodge state: 0 at rest (healthy), climbing to 1 at
 *  the excitation ceiling (the wave crest). This continuous channel is what the
 *  display LINEAR-filters, so spirals upsample smoothly. */
export function stateIntensity(state: number, states: number): number {
  return Math.min(1, Math.max(0, state / states))
}

// Seed at a coarse block granularity rather than per-pixel: coherent patches of
// equal excitation curl into spiral cores at their borders, so the field
// organizes into clean spirals within a few seconds even at a calm sim speed
// (per-pixel white noise takes far longer to anneal out).
export const SEED_BLOCK = 4

/** Deterministic seeded initial field: coarse random patches of excitation in
 *  0..states that self-organize into a dense field of BZ spiral and target waves.
 *  Returns RGBA32F (state, intensity, 0, 1) per texel. */
export function seedField(seed: number, w: number, h: number, states: number): Float32Array {
  const out = new Float32Array(w * h * 4)
  const rng = mulberry32(seed)
  const bw = Math.ceil(w / SEED_BLOCK)
  const bh = Math.ceil(h / SEED_BLOCK)
  const coarse = new Float32Array(bw * bh)
  for (let i = 0; i < bw * bh; i++) coarse[i] = Math.floor(rng() * (states + 1))
  for (let y = 0; y < h; y++) {
    const by = Math.floor(y / SEED_BLOCK)
    for (let x = 0; x < w; x++) {
      const s = coarse[by * bw + Math.floor(x / SEED_BLOCK)]
      const idx = (y * w + x) * 4
      out[idx] = s
      out[idx + 1] = stateIntensity(s, states)
      out[idx + 3] = 1
    }
  }
  return out
}

/** Bake the intensity→color gradient into a 256×RGBA byte LUT (256×1 texture). */
export function buildLUT(stops: string[]): Uint8Array {
  const s8 = stops.map((s) => (s.length === 7 ? s + 'ff' : s)) // widen #rrggbb
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
