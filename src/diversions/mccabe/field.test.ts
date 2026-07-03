import { describe, it, expect } from 'vitest'
import { simDims, seedField, buildLUT, computeScales, SIM_MAX_SIDE, BASE_SCALES } from './field'

describe('simDims', () => {
  it('caps the longest side and keeps aspect', () => {
    const { sw, sh } = simDims(1920, 1080)
    expect(Math.max(sw, sh)).toBeLessThanOrEqual(SIM_MAX_SIDE)
    expect(sw / sh).toBeCloseTo(1920 / 1080, 1)
  })
  it('leaves small sizes untouched', () => {
    expect(simDims(400, 300)).toEqual({ sw: 400, sh: 300 })
  })
})

describe('seedField', () => {
  it('is deterministic per seed and fills R with values in [-1,1]', () => {
    const a = seedField(1, 8, 8)
    expect([...a]).toEqual([...seedField(1, 8, 8)])
    expect([...a]).not.toEqual([...seedField(2, 8, 8)])
    for (let i = 0; i < 64; i++) {
      expect(a[i * 4]).toBeGreaterThanOrEqual(-1)
      expect(a[i * 4]).toBeLessThanOrEqual(1)
      expect(a[i * 4 + 3]).toBe(1) // alpha
    }
  })
})

describe('buildLUT', () => {
  it('bakes a 256×RGBA ramp (opaque, non-cyclic ends differ)', () => {
    const lut = buildLUT(['#000000', '#ffffff'])
    expect(lut.length).toBe(256 * 4)
    expect(lut[3]).toBe(255)
    expect(lut[0]).toBeLessThan(lut[255 * 4]) // dark end < light end
  })
})

describe('computeScales', () => {
  it('shifts every scale coarser and clamps to the mip ceiling', () => {
    const s = computeScales(1, 6)
    expect(s.n).toBe(BASE_SCALES.length)
    expect(s.actLod[0]).toBe(BASE_SCALES[0].a + 1)
    // a low mip ceiling clamps the coarsest scales
    const clamped = computeScales(2, 4)
    for (let i = 0; i < clamped.n; i++) {
      expect(clamped.actLod[i]).toBeLessThanOrEqual(4)
      expect(clamped.inhLod[i]).toBeLessThanOrEqual(4)
    }
  })
})
