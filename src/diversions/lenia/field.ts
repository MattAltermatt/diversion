import { makeNoise3D } from '../../framework/rng'
import { sampleGradientRGBA } from '../../framework/gradient'

// Cap the sim field's longest side. Lenia cost is O(texels × R² × simSpeed) — the
// ring convolution is far heavier per texel than Gray-Scott's 9-tap Laplacian, so
// the cap is tighter (512 vs 640). Feature size scales with this → 🎚️ tunable.
export const SIM_MAX_SIDE = 360

export function simDims(w: number, h: number): { sw: number; sh: number } {
  const longest = Math.max(w, h)
  const s = longest > SIM_MAX_SIDE ? SIM_MAX_SIDE / longest : 1
  return { sw: Math.max(1, Math.round(w * s)), sh: Math.max(1, Math.round(h * s)) }
}

/** Smooth low-frequency primordial soup in [0,1], sized to the sim grid. Coarse
 *  value noise (≈12 cells across the long edge) so the kernel has real structure to
 *  chew on — per-texel white noise would average to a flat grey and the growth
 *  function would collapse the field. Returns RGBA32F data (field in .r, A=1). */
export function seedField(seed: number, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h * 4)
  const noise = makeNoise3D(seed)
  const scale = 12 / Math.max(w, h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const n = noise(x * scale, y * scale, 0) // [-1,1]
      const v = Math.max(0, Math.min(1, n * 0.5 + 0.5))
      const idx = (y * w + x) * 4
      out[idx] = v
      out[idx + 3] = 1
    }
  return out
}

/** Ring weights per concentric shell. Smooth = single soft ring; Layered = three
 *  decreasing rings → a richer, more textured kernel. */
export function kernelBeta(kernel: 'Smooth' | 'Layered'): number[] {
  return kernel === 'Layered' ? [1, 2 / 3, 1 / 3] : [1]
}

// Canonical Lenia shell kernel: split normalized radius [0,1) into β.length shells;
// within each shell, a Gaussian bump peaked at the shell center, scaled by β.
function kernelShape(r: number, beta: number[]): number {
  if (r >= 1) return 0
  const n = beta.length
  const br = r * n
  const shell = Math.min(n - 1, Math.floor(br))
  const x = br - shell // 0..1 within the shell
  const bump = Math.exp(-((x - 0.5) ** 2) / (2 * 0.15 * 0.15))
  return beta[shell] * bump
}

export const KERNEL_LUT_W = 256

/** 1-D radial kernel LUT (length KERNEL_LUT_W), indexed by r = dist/R in [0,1] and
 *  normalized so that, summed over the actual (2R+1)² disc (r ≤ 1), the weights total
 *  ≈ 1 — i.e. the shader's potential is a weighted average of neighbor field values. */
export function buildKernelLUT(radius: number, kernel: 'Smooth' | 'Layered'): Float32Array {
  const beta = kernelBeta(kernel)
  let S = 0
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      const r = Math.sqrt(dx * dx + dy * dy) / radius
      if (r <= 1) S += kernelShape(r, beta)
    }
  const lut = new Float32Array(KERNEL_LUT_W)
  for (let i = 0; i < KERNEL_LUT_W; i++) {
    const r = i / (KERNEL_LUT_W - 1)
    lut[i] = S > 0 ? kernelShape(r, beta) / S : 0
  }
  return lut
}

/** Bake the field→color gradient into a 256×RGBA byte LUT (uploaded as 256×1 tex). */
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
