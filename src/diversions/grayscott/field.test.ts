import { describe, it, expect } from 'vitest'
import { simDims, seedField, buildLUT } from './field'

describe('simDims', () => {
  it('caps the longest side to 640, preserving aspect', () => {
    const { sw, sh } = simDims(1920, 1080)
    expect(Math.max(sw, sh)).toBe(640)
    expect(sw / sh).toBeCloseTo(1920 / 1080, 2)
  })
  it('passes a small field through uncapped', () => {
    expect(simDims(500, 300)).toEqual({ sw: 500, sh: 300 })
  })
  it('caps a tall field by its height', () => {
    const { sw, sh } = simDims(400, 1280)
    expect(sh).toBe(640)
    expect(sw).toBe(200)
  })
})

describe('seedField', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(seedField(1, 64, 64)).toEqual(seedField(1, 64, 64))
    expect(seedField(1, 64, 64)).not.toEqual(seedField(2, 64, 64))
  })
  it('base field is U=1,V=0 with a minority of seeded V patches', () => {
    const f = seedField(1, 64, 64)
    expect(f.length).toBe(64 * 64 * 4)
    let vPos = 0
    for (let i = 0; i < 64 * 64; i++) {
      const u = f[i * 4], v = f[i * 4 + 1]
      expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThanOrEqual(1)
      expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1)
      if (v > 0) vPos++
    }
    expect(vPos).toBeGreaterThan(0)
    expect(vPos).toBeLessThan(64 * 64) // not the whole field
  })
})

describe('buildLUT', () => {
  it('bakes a 256×RGBA byte ramp, opaque, dark→bright', () => {
    const lut = buildLUT(['#000000', '#ffffff'])
    expect(lut.length).toBe(256 * 4)
    expect(lut[3]).toBe(255)                  // alpha opaque
    expect(lut[0]).toBeLessThan(lut[255 * 4]) // R climbs dark→bright
  })
})
