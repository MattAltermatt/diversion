import { describe, it, expect } from 'vitest'
import { simDims, seedField, stateIntensity, buildLUT, SIM_MAX_SIDE } from './field'

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

describe('stateIntensity', () => {
  it('is 0 at rest, 1 at the ceiling, and climbs monotonically between', () => {
    const q = 100
    expect(stateIntensity(0, q)).toBe(0)
    expect(stateIntensity(q, q)).toBe(1)
    expect(stateIntensity(q / 2, q)).toBeGreaterThan(stateIntensity(q / 4, q))
  })
  it('clamps out-of-range states into 0..1', () => {
    expect(stateIntensity(-5, 100)).toBe(0)
    expect(stateIntensity(150, 100)).toBe(1)
  })
})

describe('seedField', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(seedField(1, 48, 48, 100)).toEqual(seedField(1, 48, 48, 100))
    expect(seedField(1, 48, 48, 100)).not.toEqual(seedField(2, 48, 48, 100))
  })
  it('stores integer states in 0..q with a matching intensity channel', () => {
    const q = 100
    const f = seedField(7, 40, 40, q)
    expect(f.length).toBe(40 * 40 * 4)
    for (let i = 0; i < 40 * 40; i++) {
      const s = f[i * 4]
      expect(Number.isInteger(s)).toBe(true)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(q)
      expect(f[i * 4 + 1]).toBeCloseTo(stateIntensity(s, q))
    }
  })
  it('exercises a broad range of states across a reasonable field', () => {
    const f = seedField(3, 64, 64, 100)
    const seen = new Set<number>()
    for (let i = 0; i < 64 * 64; i++) seen.add(f[i * 4])
    expect(seen.size).toBeGreaterThan(10) // a rich spread of initial excitation
  })
})

describe('buildLUT', () => {
  it('bakes a 256×RGBA byte ramp, opaque, dark→bright', () => {
    const lut = buildLUT(['#000000', '#ffffff'])
    expect(lut.length).toBe(256 * 4)
    expect(lut[3]).toBe(255)
    expect(lut[0]).toBeLessThan(lut[255 * 4])
  })
})
