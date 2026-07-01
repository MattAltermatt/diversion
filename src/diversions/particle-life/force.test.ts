import { describe, it, expect } from 'vitest'
import { force, forceCurveId, FORCE_CURVES } from './force'

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

  it('defaults to the Standard curve (curve 0)', () => {
    const center = (1 + beta) / 2
    expect(force(center, 0.7, beta)).toBeCloseTo(force(center, 0.7, beta, 0), 6)
  })
})

describe('force curves (#206)', () => {
  const beta = 0.3
  const s = (q: number) => (q - beta) / (1 - beta) // normalized band position
  const at = (sVal: number) => beta + sVal * (1 - beta) // inverse: s → q

  it('every curve shares the identical repulsion core (no collapse)', () => {
    for (let c = 0; c < FORCE_CURVES.length; c++) {
      expect(force(0, 0.9, beta, c)).toBeCloseTo(-1, 6) // touching = max repel
      expect(force(0.15, -0.9, beta, c)).toBeCloseTo(0.15 / beta - 1, 6)
      expect(force(1.2, 0.9, beta, c)).toBe(0) // out of range
    }
  })

  it('every curve is continuous with the core at beta and zero at the radius', () => {
    for (let c = 0; c < FORCE_CURVES.length; c++) {
      expect(force(beta, 0.9, beta, c)).toBeCloseTo(0, 6) // s=0 → band 0
      expect(force(1 - 1e-9, 0.9, beta, c)).toBeCloseTo(0, 4) // s→1 → band 0
    }
  })

  it('Smooth (1) is a sine arch peaking at s=0.5', () => {
    expect(force(at(0.5), 1, beta, 1)).toBeCloseTo(1, 6) // sin(pi/2) = 1
    expect(force(at(0.25), 1, beta, 1)).toBeCloseTo(Math.sin(Math.PI * 0.25), 6)
  })

  it('Long-range (2) peaks early (s=0.2) with a long decaying tail', () => {
    expect(force(at(0.2), 1, beta, 2)).toBeCloseTo(1, 6) // peak at s=0.2
    // monotonic decay after the peak: s=0.5 pulls harder than s=0.9
    expect(force(at(0.5), 1, beta, 2)).toBeGreaterThan(force(at(0.9), 1, beta, 2))
    expect(s(at(0.2))).toBeCloseTo(0.2, 6) // sanity on the helpers
  })

  it('Stepped (3) quantizes into flat plateaus', () => {
    const vals = [0.1, 0.15, 0.2].map((sv) => force(at(sv), 1, beta, 3))
    expect(new Set(vals.map((v) => v.toFixed(6))).size).toBeLessThan(3) // a plateau ⇒ repeats
    for (const v of vals) expect(Math.round(v * 3) * (1 / 3)).toBeCloseTo(v, 6) // on a 1/3 grid
  })

  it('forceCurveId maps names to indices and falls back to 0', () => {
    expect(forceCurveId('Standard')).toBe(0)
    expect(forceCurveId('Stepped')).toBe(3)
    expect(forceCurveId('nonsense')).toBe(0)
  })
})
