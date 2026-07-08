import { describe, it, expect } from 'vitest'
import {
  MAPS, FALLBACK, measureOrbit, isValidOrbit, sampleCoeffs, driftedCoeffs,
  screenScale, type Coeffs, type HopalongMap,
} from './hopalong'

const KINDS: HopalongMap[] = ['martin', 'sine', 'rr']

describe('map kernels', () => {
  it('are deterministic — same input, same output', () => {
    const c: Coeffs = { a: 2, b: 1, c: 0.5, d: 0.4 }
    for (const k of KINDS) {
      const a = MAPS[k](0.3, -0.2, c)
      const b = MAPS[k](0.3, -0.2, c)
      expect(a).toEqual(b)
    }
  })

  it('martin matches the classic x\' = y - sign(x)*sqrt(|bx-c|), y\' = a-x', () => {
    const c: Coeffs = { a: 2, b: 1.2, c: 0.3, d: 0 }
    // x = 0.4 > 0 -> sign(x) = +1 -> subtract the sqrt term
    const pos = MAPS.martin(0.4, 0.1, c)
    expect(pos.y).toBeCloseTo(c.a - 0.4, 12)
    expect(pos.x).toBeCloseTo(0.1 - Math.sqrt(Math.abs(c.b * 0.4 - c.c)), 12)
    // x = -0.4 < 0 -> sign(x) = -1 -> add the sqrt term
    const neg = MAPS.martin(-0.4, 0.1, c)
    expect(neg.y).toBeCloseTo(c.a - (-0.4), 12)
    expect(neg.x).toBeCloseTo(0.1 + Math.sqrt(Math.abs(c.b * -0.4 - c.c)), 12)
  })

  it('sine matches x\' = y - sin(x), y\' = a-x', () => {
    const c: Coeffs = { a: Math.PI, b: 0, c: 0, d: 0 }
    const r = MAPS.sine(0.6, 0.2, c)
    expect(r.x).toBeCloseTo(0.2 - Math.sin(0.6), 12)
    expect(r.y).toBeCloseTo(c.a - 0.6, 12)
  })

  it('rr matches x\' = y - sign(x)*|bx-c|^d, y\' = a-x', () => {
    const c: Coeffs = { a: 1, b: 1, c: 0.2, d: 0.4 }
    const pos = MAPS.rr(0.5, 0.1, c)
    expect(pos.x).toBeCloseTo(0.1 - Math.pow(Math.abs(c.b * 0.5 - c.c), c.d), 12)
    const neg = MAPS.rr(-0.5, 0.1, c)
    expect(neg.x).toBeCloseTo(0.1 + Math.pow(Math.abs(c.b * -0.5 - c.c), c.d), 12)
  })

  it('keeps every fallback orbit finite for 5000 steps', () => {
    for (const k of KINDS) {
      let x = 0.1, y = 0.1
      for (let i = 0; i < 5000; i++) {
        const n = MAPS[k](x, y, FALLBACK[k]); x = n.x; y = n.y
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
      }
    }
  })
})

describe('measureOrbit / isValidOrbit', () => {
  it('accepts every fallback coefficient set with a positive half-extent', () => {
    for (const k of KINDS) {
      const m = measureOrbit(k, FALLBACK[k])
      expect(m).not.toBeNull()
      expect(m!.halfExtent).toBeGreaterThan(0)
      expect(isValidOrbit(k, FALLBACK[k])).toBe(true)
    }
  })

  it('rejects a collapsed martin orbit (spread below the minimum gate)', () => {
    expect(isValidOrbit('martin', { a: 0, b: -0.4, c: 0, d: 0 })).toBe(false)
  })
})

describe('sampleCoeffs', () => {
  it('is deterministic per seed', () => {
    for (const k of KINDS) {
      expect(sampleCoeffs(k, 12345)).toEqual(sampleCoeffs(k, 12345))
    }
  })

  it('different seeds produce different coefficients', () => {
    for (const k of KINDS) {
      const a = sampleCoeffs(k, 1)
      const b = sampleCoeffs(k, 2)
      expect(a).not.toEqual(b)
    }
  })

  it('always returns a valid, positively-extended orbit (gate or fallback)', () => {
    for (const k of KINDS) {
      for (const seed of [1, 2, 7, 42, 99, 1000]) {
        const { coeffs, halfExtent } = sampleCoeffs(k, seed)
        expect(isValidOrbit(k, coeffs)).toBe(true)
        expect(halfExtent).toBeGreaterThan(0)
      }
    }
  })
})

describe('driftedCoeffs', () => {
  it('drift=0 is frozen (equals base for any t)', () => {
    const base: Coeffs = { a: 1, b: 2, c: 3, d: 0.4 }
    for (const k of KINDS) {
      expect(driftedCoeffs(k, base, 0, 0)).toEqual(base)
      expect(driftedCoeffs(k, base, 999999, 0)).toEqual(base)
    }
  })

  it('stays within the per-map drift amplitude of base for all t', () => {
    const base: Coeffs = { a: 0, b: 0, c: 0, d: 0 }
    const amps = { martin: 0.4, sine: 0.3, rr: 0.3 } // matches DRIFT_AMP a/b/c in hopalong.ts
    for (const k of KINDS) {
      for (let t = 0; t < 200000; t += 977) {
        const d = driftedCoeffs(k, base, t, 1)
        for (const key of ['a', 'b', 'c'] as const) {
          expect(Math.abs(d[key])).toBeLessThanOrEqual(amps[k] + 1e-9)
        }
      }
    }
  })
})

describe('screenScale', () => {
  it('is positive and shrinks as halfExtent grows', () => {
    const s1 = screenScale(5, 800, 600)
    const s2 = screenScale(50, 800, 600)
    expect(s1).toBeGreaterThan(0)
    expect(s2).toBeGreaterThan(0)
    expect(s2).toBeLessThan(s1)
  })
})
