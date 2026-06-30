import { describe, it, expect } from 'vitest'
import { simDims, seedField, kernelBeta, buildKernelLUT, buildLUT, KERNEL_LUT_W, SIM_MAX_SIDE } from './field'

describe('lenia field', () => {
  it('simDims caps the longest side at SIM_MAX_SIDE, preserving aspect', () => {
    const capped = simDims(2000, 1000)
    expect(capped.sw).toBe(SIM_MAX_SIDE)
    expect(capped.sh).toBe(Math.round(SIM_MAX_SIDE / 2))
    // Under-cap sizes pass through untouched.
    const small = simDims(SIM_MAX_SIDE - 120, SIM_MAX_SIDE - 220)
    expect(small).toEqual({ sw: SIM_MAX_SIDE - 120, sh: SIM_MAX_SIDE - 220 })
  })
  it('seedField is deterministic per seed and differs across seeds', () => {
    const a = seedField(42, 16, 16)
    const b = seedField(42, 16, 16)
    const c = seedField(43, 16, 16)
    expect(Array.from(a)).toEqual(Array.from(b))
    expect(Array.from(a)).not.toEqual(Array.from(c))
  })
  it('seedField stays in [0,1] with a smooth (non-flat) field', () => {
    const f = seedField(7, 32, 32)
    let min = 1, max = 0
    for (let i = 0; i < 32 * 32; i++) { const v = f[i * 4]; min = Math.min(min, v); max = Math.max(max, v) }
    expect(min).toBeGreaterThanOrEqual(0)
    expect(max).toBeLessThanOrEqual(1)
    expect(max - min).toBeGreaterThan(0.2) // real structure, not a flat grey
  })
  it('kernelBeta gives one ring for Smooth, three for Layered', () => {
    expect(kernelBeta('Smooth')).toHaveLength(1)
    expect(kernelBeta('Layered')).toHaveLength(3)
  })
  it('buildKernelLUT normalizes so the disc sum ≈ 1', () => {
    const R = 12
    const lut = buildKernelLUT(R, 'Smooth')
    expect(lut).toHaveLength(KERNEL_LUT_W)
    // Reconstruct the shader-side sum: every disc tap samples lut[round(r*(W-1))].
    let sum = 0
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const r = Math.sqrt(dx * dx + dy * dy) / R
        if (r <= 1) sum += lut[Math.round(r * (KERNEL_LUT_W - 1))]
      }
    expect(sum).toBeCloseTo(1, 1) // within ~0.05 of 1
  })
  it('Smooth and Layered kernels differ', () => {
    expect(Array.from(buildKernelLUT(12, 'Smooth'))).not.toEqual(Array.from(buildKernelLUT(12, 'Layered')))
  })
  it('buildLUT bakes a 256×RGBA byte ramp', () => {
    const lut = buildLUT(['#000000', '#ffffff'])
    expect(lut).toHaveLength(256 * 4)
    expect(lut[0]).toBe(0)            // first stop black
    expect(lut[255 * 4]).toBe(255)   // last stop white
  })
})
