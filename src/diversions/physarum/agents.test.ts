import { describe, it, expect } from 'vitest'
import { texDimFor, initAgents, buildLUT } from './agents'

describe('texDimFor', () => {
  it('returns a power of two whose square covers the count', () => {
    for (const n of [10000, 262144, 1000000, 1, 16385]) {
      const d = texDimFor(n)
      expect(d * d).toBeGreaterThanOrEqual(Math.min(n, d * d))
      expect(Number.isInteger(Math.log2(d))).toBe(true)
    }
    expect(texDimFor(262144)).toBe(512) // exact square
    expect(texDimFor(262145)).toBe(1024) // just over → next pow2
    expect(texDimFor(1)).toBe(16) // floor
  })
})

describe('initAgents', () => {
  it('is deterministic in the seed', () => {
    expect(initAgents(7, 10000)).toEqual(initAgents(7, 10000))
    expect(initAgents(7, 10000)).not.toEqual(initAgents(8, 10000))
  })
  it('fills a full pow2-square RGBA buffer with in-range values', () => {
    const count = 10000
    const dim = texDimFor(count)
    const a = initAgents(7, count)
    expect(a.length).toBe(dim * dim * 4)
    for (let i = 0; i < a.length; i += 4) {
      expect(a[i]).toBeGreaterThanOrEqual(0); expect(a[i]).toBeLessThan(1) // x
      expect(a[i + 1]).toBeGreaterThanOrEqual(0); expect(a[i + 1]).toBeLessThan(1) // y
      expect(a[i + 2]).toBeGreaterThanOrEqual(0); expect(a[i + 2]).toBeLessThan(Math.PI * 2) // heading
    }
  })
})

describe('buildLUT', () => {
  it('produces 256 RGBA texels with matching endpoints', () => {
    const lut = buildLUT(['#000000', '#ffffff'])
    expect(lut.length).toBe(256 * 4)
    expect([lut[0], lut[1], lut[2]]).toEqual([0, 0, 0]) // first stop
    expect([lut[1020], lut[1021], lut[1022]]).toEqual([255, 255, 255]) // last stop
  })
})
