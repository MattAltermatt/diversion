import { describe, it, expect } from 'vitest'
import { simDims, seedField, buildLUT, SIM_MAX_SIDE } from './field'

describe('simDims', () => {
  it('caps the longest side to SIM_MAX_SIDE, preserving aspect', () => {
    const { sw, sh } = simDims(1920, 1080)
    expect(Math.max(sw, sh)).toBe(SIM_MAX_SIDE)
    expect(sw / sh).toBeCloseTo(1920 / 1080, 2)
  })
  it('passes a small field through uncapped', () => {
    expect(simDims(500, 300)).toEqual({ sw: 500, sh: 300 })
  })
})

describe('seedField', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(seedField(1, 48, 48, 0.5)).toEqual(seedField(1, 48, 48, 0.5))
    expect(seedField(1, 48, 48, 0.5)).not.toEqual(seedField(2, 48, 48, 0.5))
  })
  it('stores phase in [0,2π) with matching cos/sin channels', () => {
    const f = seedField(7, 40, 40, 0.5)
    expect(f.length).toBe(40 * 40 * 4)
    for (let i = 0; i < 40 * 40; i++) {
      const ph = f[i * 4]
      expect(ph).toBeGreaterThanOrEqual(0)
      expect(ph).toBeLessThan(Math.PI * 2)
      expect(f[i * 4 + 2]).toBeCloseTo(Math.cos(ph))
      expect(f[i * 4 + 3]).toBeCloseTo(Math.sin(ph))
    }
  })
  it('spreads natural frequencies wider with a larger spread', () => {
    const range = (spread: number) => {
      const f = seedField(3, 64, 64, spread)
      let lo = Infinity, hi = -Infinity
      for (let i = 0; i < 64 * 64; i++) { const w = f[i * 4 + 1]; if (w < lo) lo = w; if (w > hi) hi = w }
      return hi - lo
    }
    expect(range(1.2)).toBeGreaterThan(range(0.2))
  })
})

describe('buildLUT', () => {
  it('bakes a 256×RGBA cyclic wheel, opaque, and roughly wraps end→start', () => {
    const lut = buildLUT(['#ff0000', '#00ff00', '#0000ff'])
    expect(lut.length).toBe(256 * 4)
    expect(lut[3]).toBe(255)
    // cyclic: entry 0 and entry 255 should be close (both near the wrap seam)
    for (let c = 0; c < 3; c++) expect(Math.abs(lut[c] - lut[255 * 4 + c])).toBeLessThan(90)
  })
})
