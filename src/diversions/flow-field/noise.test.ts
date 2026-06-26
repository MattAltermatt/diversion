import { describe, it, expect } from 'vitest'
import { makeNoise2D } from './noise'

describe('makeNoise2D', () => {
  it('is deterministic for a given seed', () => {
    const a = makeNoise2D(1234)
    const b = makeNoise2D(1234)
    expect(a(0.3, 0.7)).toBeCloseTo(b(0.3, 0.7), 10)
  })

  it('differs across seeds', () => {
    expect(makeNoise2D(1)(0.3, 0.7)).not.toBeCloseTo(makeNoise2D(2)(0.3, 0.7), 6)
  })

  it('returns values within [-1, 1]', () => {
    const n = makeNoise2D(42)
    for (let i = 0; i < 100; i++) {
      const v = n(i * 0.13, i * 0.29)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})
