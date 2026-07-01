import { describe, it, expect } from 'vitest'
import { force } from './force'

describe('force (beta model)', () => {
  const beta = 0.3

  it('repels inside the personal-space core, ramping -1 → 0', () => {
    expect(force(0, 0.9, beta)).toBeCloseTo(-1, 6) // touching = max repulsion, matrix-independent
    expect(force(beta / 2, 0.9, beta)).toBeCloseTo(-0.5, 6)
    expect(force(beta - 1e-9, -0.9, beta)).toBeLessThan(0)
  })

  it('is species-independent inside the core', () => {
    expect(force(0.1, 0.9, beta)).toBeCloseTo(force(0.1, -0.9, beta), 6)
  })

  it('is zero at the core boundary and beyond the radius', () => {
    expect(force(beta, 0.9, beta)).toBeCloseTo(0, 6) // band starts at 0
    expect(force(1, 0.9, beta)).toBe(0)
    expect(force(1.5, 0.9, beta)).toBe(0)
  })

  it('peaks at the band center with value = a', () => {
    const center = (1 + beta) / 2
    expect(force(center, 0.7, beta)).toBeCloseTo(0.7, 6)
    expect(force(center, -0.4, beta)).toBeCloseTo(-0.4, 6)
  })

  it('sign of the band follows the matrix coefficient', () => {
    const q = 0.65
    expect(force(q, 0.5, beta)).toBeGreaterThan(0) // attraction
    expect(force(q, -0.5, beta)).toBeLessThan(0) // repulsion
  })
})
