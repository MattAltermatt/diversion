import { mulberry32 } from '../../framework/rng'
import { sampleCyclic } from '../../framework/gradient'

// Cap the sim grid's longest side. Cost is O(cells × simSpeed). The display reads
// cos/sin channels with LINEAR filtering, so the phase field upsamples smoothly.
export const SIM_MAX_SIDE = 540

// A small shared drift so even a fully-synced field keeps shimmering through hues.
const OMEGA0 = 0.25
const TAU = Math.PI * 2

export function simDims(w: number, h: number): { sw: number; sh: number } {
  const longest = Math.max(w, h)
  const s = longest > SIM_MAX_SIDE ? SIM_MAX_SIDE / longest : 1
  return { sw: Math.max(1, Math.round(w * s)), sh: Math.max(1, Math.round(h * s)) }
}

/** Deterministic seeded field: each cell gets a random phase and a natural
 *  frequency (shared drift ± spread). RGBA32F = (phase, omega, cos φ, sin φ).
 *  cos/sin are stored so the display can LINEAR-interpolate the hue seamlessly
 *  across the 2π wrap. */
export function seedField(seed: number, w: number, h: number, spread: number): Float32Array {
  const out = new Float32Array(w * h * 4)
  const rng = mulberry32(seed)
  for (let i = 0; i < w * h; i++) {
    const phase = rng() * TAU
    const omega = OMEGA0 + (rng() - 0.5) * spread
    out[i * 4] = phase
    out[i * 4 + 1] = omega
    out[i * 4 + 2] = Math.cos(phase)
    out[i * 4 + 3] = Math.sin(phase)
  }
  return out
}

/** Bake the cyclic phase→color wheel into a 256×RGBA byte LUT. */
export function buildLUT(stops: string[]): Uint8Array {
  const s8 = stops.map((s) => (s.length === 7 ? s + 'ff' : s))
  const lut = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    const c = sampleCyclic(s8, i / 256)
    lut[i * 4 + 0] = Math.round(c.r)
    lut[i * 4 + 1] = Math.round(c.g)
    lut[i * 4 + 2] = Math.round(c.b)
    lut[i * 4 + 3] = 255
  }
  return lut
}
