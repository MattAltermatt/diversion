import { mulberry32 } from '../../framework/rng'
import { sampleGradientRGBA } from '../../framework/gradient'

// Cap the sim field's longest side. Foam runs a multi-order-parameter Allen–Cahn
// grain-growth sim over 8 fields packed in 2 RGBA32F targets (MRT), ~20 texture
// fetches/pixel per step. 512 keeps that trivially 60fps while leaving room for the
// bubbles to read as smooth curved cells. Feature/cell size scales with κ
// (cellScale) at this resolution, NOT with the grid, so this is a fixed cap.
export const SIM_MAX_SIDE = 512

// N = 8 order-parameter fields, packed 4-per-RGBA32F texture → 2 state textures.
export const N_FIELDS = 8

export function simDims(w: number, h: number): { sw: number; sh: number } {
  const longest = Math.max(w, h)
  const s = longest > SIM_MAX_SIDE ? SIM_MAX_SIDE / longest : 1
  return { sw: Math.max(1, Math.round(w * s)), sh: Math.max(1, Math.round(h * s)) }
}

/** Deterministic seeded initial field for the 8 order parameters, packed into two
 *  RGBA32F arrays (fields 0–3 in `a`, 4–7 in `b`). Each texel nucleates as a single
 *  random grain: its chosen field ≈ 1, the rest ≈ 0 (plus a whisper of noise to
 *  break perfect ties). White-noise labels coarsen almost immediately to scale κ —
 *  exactly how a real froth nucleates then coarsens. Returns two Float32Arrays of
 *  w*h*4. */
export function seedFoam(seed: number, w: number, h: number): { a: Float32Array; b: Float32Array } {
  const a = new Float32Array(w * h * 4)
  const b = new Float32Array(w * h * 4)
  const rng = mulberry32(seed)
  for (let i = 0; i < w * h; i++) {
    // faint background noise on every field so interfaces have something to relax
    for (let k = 0; k < 4; k++) {
      a[i * 4 + k] = rng() * 0.02
      b[i * 4 + k] = rng() * 0.02
    }
    const lbl = Math.floor(rng() * N_FIELDS)
    if (lbl < 4) a[i * 4 + lbl] = 1.0
    else b[i * 4 + (lbl - 4)] = 1.0
  }
  return { a, b }
}

/** Bake a grain-color ramp into a 256×RGBA byte LUT (uploaded as 256×1 tex). The
 *  display samples it at 8 evenly-spaced points — one per order parameter — so a
 *  short colorList becomes the palette of grain colors. */
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

/** cellScale (interface-width / bubble-size dial) → κ, the gradient-energy
 *  coefficient. Larger κ = wider interfaces = chunkier cells. */
export function kappaFor(cellScale: number): number {
  return Math.max(0.25, cellScale)
}

/** Explicit-Euler timestep that stays stable across the κ range: the 9-tap
 *  Laplacian's diffusion limit is ~dt·κ < 0.5, and the η³−η reaction wants dt < 0.5,
 *  so cap dt and shrink it as κ climbs. simSpeed (sub-steps/frame) sets the pace, so
 *  a small dt just means more sub-steps, not a slower diversion. */
export function dtFor(kappa: number): number {
  return Math.min(0.2, 0.4 / kappa)
}
