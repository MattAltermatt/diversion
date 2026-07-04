import { mulberry32 } from '../../framework/rng'
import { sampleGradientRGBA } from '../../framework/gradient'

// Cap the sim field's longest side. Cost is O(texels × simSpeed); 640 keeps the
// sub-step loop cheap on 4K/retina while giving fine finger detail. Feature size
// scales with this, so it's a 🎚️ tunable (confirm at verify).
export const SIM_MAX_SIDE = 640

// Reaction-diffusion coefficients (Gray-Scott analog of Hele-Shaw flow). Feed is
// held at the branching "coral" value; the two user knobs (viscosity ratio, surface
// tension) map into the narrow band around it that stays fractal-fingering rather
// than dying out or freezing into spots. 🎚️ confirm at verify.
export const FEED = 0.0545
export const DU = 1.0 // U (resident fluid) diffusion
export const VMAX = 0.4 // V rarely exceeds this; normalize by it before the LUT

// Higher viscosity ratio → higher kill → thinner, more separated (more-branching)
// fingers. Clamped to the viable coral band so the field never dies or freezes.
export function killFor(viscosityRatio: number): number {
  const t = Math.min(1, Math.max(0, viscosityRatio))
  return 0.059 + t * (0.063 - 0.059)
}

// Higher surface tension → more V spreading → wider, smoother fingers (the physical
// role of surface tension: it smooths the interface and sets the finger width).
export function dvFor(surfaceTension: number): number {
  const t = Math.min(1, Math.max(0, surfaceTension))
  return 0.35 + t * (0.6 - 0.35)
}

export function simDims(w: number, h: number): { sw: number; sh: number } {
  const longest = Math.max(w, h)
  const s = longest > SIM_MAX_SIDE ? SIM_MAX_SIDE / longest : 1
  return { sw: Math.max(1, Math.round(w * s)), sh: Math.max(1, Math.round(h * s)) }
}

/** Deterministic seeded initial field, sized to the sim grid. Base U=1,V=0
 *  ("empty" resident fluid); a single small CENTRAL disc of invading fluid
 *  (U=0.5,V≈0.3, jittered by the seeded stream to break perfect radial symmetry)
 *  is the injection point everything grows outward from — unlike a scattered
 *  reaction-diffusion seed, this concentrates the source so the structure reads as
 *  directional outward fingering. Channels: (U, V, arrivalStamp, 1) per texel. */
export function seedField(seed: number, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h * 4)
  for (let i = 0; i < w * h; i++) { out[i * 4] = 1; out[i * 4 + 3] = 1 }
  const rng = mulberry32(seed)
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2)
  const r = Math.max(2, Math.round(Math.min(w, h) * 0.03))
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue
      const x = cx + dx, y = cy + dy
      if (x < 0 || x >= w || y < 0 || y >= h) continue
      const idx = (y * w + x) * 4
      out[idx] = 0.5
      out[idx + 1] = 0.28 + rng() * 0.08 // jitter seeds early symmetry-breaking
    }
  return out
}

/** Bake the color gradient into a 256×RGBA byte LUT (uploaded as a 256×1 tex). */
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
