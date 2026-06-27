import { describe, it, expect } from 'vitest'
import { makeNoise3D } from './noise'

describe('makeNoise3D', () => {
  it('is deterministic for a given seed', () => {
    const a = makeNoise3D(1234)
    const b = makeNoise3D(1234)
    expect(a(0.3, 0.7, 0.5)).toBeCloseTo(b(0.3, 0.7, 0.5), 10)
  })

  it('differs across seeds', () => {
    expect(makeNoise3D(1)(0.3, 0.7, 0.5)).not.toBeCloseTo(makeNoise3D(2)(0.3, 0.7, 0.5), 6)
  })

  it('varies along the z (time) axis', () => {
    const n = makeNoise3D(7)
    expect(n(0.3, 0.7, 0)).not.toBeCloseTo(n(0.3, 0.7, 3.5), 6)
  })

  it('returns values within [-1, 1]', () => {
    const n = makeNoise3D(42)
    for (let i = 0; i < 200; i++) {
      const v = n(i * 0.13, i * 0.29, i * 0.07)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is continuous along z (no jumps): small Δz → small Δvalue', () => {
    const n = makeNoise3D(99)
    for (let i = 0; i < 50; i++) {
      const z = i * 0.137 // sweep across many z-cell boundaries
      const d = Math.abs(n(0.4, 0.6, z) - n(0.4, 0.6, z + 0.01))
      expect(d).toBeLessThan(0.1)
    }
  })
})
