import { mulberry32 } from '../../framework/rng'
import { sampleGradientRGBA } from '../../framework/gradient'

// Cap the sim field's longest side. Gray-Scott cost is O(texels × simSpeed); 640
// keeps the sub-step loop cheap on 4K/retina while giving fine pattern detail.
// Feature size scales with this, so it's a 🎚️ tunable (confirm at verify).
export const SIM_MAX_SIDE = 640

export function simDims(w: number, h: number): { sw: number; sh: number } {
  const longest = Math.max(w, h)
  const s = longest > SIM_MAX_SIDE ? SIM_MAX_SIDE / longest : 1
  return { sw: Math.max(1, Math.round(w * s)), sh: Math.max(1, Math.round(h * s)) }
}

/** Deterministic seeded initial field, sized to the sim grid. Base U=1,V=0
 *  ("empty"); scatter a few small V=0.25,U=0.5 square patches (toroidal wrap, to
 *  match REPEAT-sampled state) to kick the reaction. Returns RGBA32F data
 *  (U,V,0,1) per texel. */
export function seedField(seed: number, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h * 4)
  for (let i = 0; i < w * h; i++) { out[i * 4] = 1; out[i * 4 + 3] = 1 }
  const rng = mulberry32(seed)
  const patches = 20
  const r = Math.max(3, Math.round(Math.min(w, h) / 40))
  for (let p = 0; p < patches; p++) {
    const cx = Math.floor(rng() * w), cy = Math.floor(rng() * h)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = (((cx + dx) % w) + w) % w
        const y = (((cy + dy) % h) + h) % h
        const idx = (y * w + x) * 4
        out[idx] = 0.5; out[idx + 1] = 0.25
      }
  }
  return out
}

/** Bake the V→color gradient into a 256×RGBA byte LUT (uploaded as 256×1 tex). */
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
