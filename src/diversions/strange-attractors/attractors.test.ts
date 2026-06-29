import { describe, it, expect } from 'vitest'
import {
  MAPS, FALLBACK, isValidOrbit, sampleCoeffs, driftedCoeffs,
  attractorColorT, screenScale, type Coeffs, type AttractorKind,
} from './attractors'

const KINDS: AttractorKind[] = ['clifford', 'deJong']

describe('map kernels', () => {
  it('are deterministic — same input, same output', () => {
    const c: Coeffs = { a: -1.4, b: 1.6, c: 1.0, d: 0.7 }
    for (const k of KINDS) {
      const a = MAPS[k](0.1, 0.2, c)
      const b = MAPS[k](0.1, 0.2, c)
      expect(a).toEqual(b)
    }
  })

  it('clifford matches its closed form', () => {
    const c: Coeffs = { a: -1.4, b: 1.6, c: 1.0, d: 0.7 }
    const r = MAPS.clifford(0.3, 0.5, c)
    expect(r.x).toBeCloseTo(Math.sin(c.a * 0.5) + c.c * Math.cos(c.a * 0.3), 12)
    expect(r.y).toBeCloseTo(Math.sin(c.b * 0.3) + c.d * Math.cos(c.b * 0.5), 12)
  })

  it('keeps a fallback orbit finite and bounded for 2000 steps', () => {
    for (const k of KINDS) {
      let x = 0.1, y = 0.1
      for (let i = 0; i < 2000; i++) {
        const n = MAPS[k](x, y, FALLBACK[k]); x = n.x; y = n.y
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
      }
    }
  })
})

describe('isValidOrbit', () => {
  it('accepts every fallback coefficient set', () => {
    for (const k of KINDS) expect(isValidOrbit(k, FALLBACK[k])).toBe(true)
  })

  it('rejects a collapsed orbit (coeffs that decay to a point)', () => {
    // a=b=c=d=0: clifford → (1, 1) fixed point after one step → zero spread
    expect(isValidOrbit('clifford', { a: 0, b: 0, c: 0, d: 0 })).toBe(false)
  })
})

describe('sampleCoeffs', () => {
  it('is deterministic per seed', () => {
    expect(sampleCoeffs('clifford', 12345)).toEqual(sampleCoeffs('clifford', 12345))
  })

  it('always returns a valid orbit (gate or fallback)', () => {
    for (const k of KINDS) {
      for (const seed of [1, 2, 7, 42, 99, 1000]) {
        expect(isValidOrbit(k, sampleCoeffs(k, seed))).toBe(true)
      }
    }
  })
})

describe('driftedCoeffs', () => {
  it('drift=0 is frozen (equals base for any t)', () => {
    const base: Coeffs = { a: -1.4, b: 1.6, c: 1.0, d: 0.7 }
    expect(driftedCoeffs(base, 0, 0)).toEqual(base)
    expect(driftedCoeffs(base, 999999, 0)).toEqual(base)
  })

  it('stays within driftAmp of base for all t', () => {
    const base: Coeffs = { a: 0, b: 0, c: 0, d: 0 }
    const amp = 0.18 // == DRIFT_AMP_MAX * drift(1)
    for (let t = 0; t < 200000; t += 137) {
      const d = driftedCoeffs(base, t, 1)
      for (const k of ['a', 'b', 'c', 'd'] as const) {
        expect(Math.abs(d[k])).toBeLessThanOrEqual(amp + 1e-9)
      }
    }
  })
})

describe('attractorColorT', () => {
  it('radius is 0 at center, 1 at the edge', () => {
    expect(attractorColorT('radius', 50, 50, 50, 50, 50, 100, 100)).toBeCloseTo(0, 6)
    expect(attractorColorT('radius', 100, 50, 50, 50, 50, 100, 100)).toBeCloseTo(1, 6)
  })

  it('x / y sources are clamped screen fractions', () => {
    expect(attractorColorT('x', 25, 0, 50, 50, 50, 100, 100)).toBeCloseTo(0.25, 6)
    expect(attractorColorT('y', 0, 80, 50, 50, 50, 100, 100)).toBeCloseTo(0.8, 6)
    expect(attractorColorT('x', 999, 0, 50, 50, 50, 100, 100)).toBe(1) // clamp high
  })
})

describe('screenScale', () => {
  it('maps each kind to a positive pixels-per-world-unit scale', () => {
    for (const k of KINDS) expect(screenScale(k, 800, 600)).toBeGreaterThan(0)
  })
})
