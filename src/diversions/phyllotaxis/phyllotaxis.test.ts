import { describe, it, expect } from 'vitest'
import { sitePositions, divergenceAt, diskRadius, siteJitter, writeFlowPositions } from './phyllotaxis'

describe('sitePositions', () => {
  it('is deterministic for a given (count, seed)', () => {
    const a = sitePositions(500, 137.507, 11, 0.5, 42)
    const b = sitePositions(500, 137.507, 11, 0.5, 42)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('differs by seed when jitter is on', () => {
    const a = sitePositions(500, 137.507, 11, 0.5, 1)
    const b = sitePositions(500, 137.507, 11, 0.5, 2)
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })

  it('ignores seed when jitter is off (pure golden-angle lattice)', () => {
    const a = sitePositions(300, 137.507, 11, 0, 1)
    const b = sitePositions(300, 137.507, 11, 0, 999)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('places floret k at radius spacing·√k regardless of jitter (jitter only rotates)', () => {
    const spacing = 11
    const pos = sitePositions(400, 137.507, spacing, 1, 7)
    for (const k of [0, 1, 5, 50, 399]) {
      const r = Math.hypot(pos[2 * k], pos[2 * k + 1])
      expect(r).toBeCloseTo(spacing * Math.sqrt(k), 6)
    }
  })

  it('puts floret 0 at the centre', () => {
    const pos = sitePositions(10, 137.507, 11, 0.5, 3)
    expect(pos[0]).toBe(0)
    expect(pos[1]).toBe(0)
  })
})

describe('siteJitter', () => {
  it('returns a stable value in [-1, 1) per (seed, k)', () => {
    for (const [seed, k] of [[1, 0], [1, 250], [99, 12]] as const) {
      const v = siteJitter(seed, k)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThan(1)
      expect(siteJitter(seed, k)).toBe(v) // stable
    }
  })
})

describe('divergenceAt', () => {
  const base = 137.507

  it('returns base at t=0 and when amplitude is 0', () => {
    expect(divergenceAt(base, 0.9, 60, 0)).toBeCloseTo(base, 9)
    expect(divergenceAt(base, 0, 60, 17)).toBe(base)
    expect(divergenceAt(base, 0.9, 0, 17)).toBe(base)
  })

  it('stays within [base−amp, base+amp] across a full cycle', () => {
    const amp = 0.9, period = 60
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * period
      const d = divergenceAt(base, amp, period, t)
      expect(d).toBeGreaterThanOrEqual(base - amp - 1e-9)
      expect(d).toBeLessThanOrEqual(base + amp + 1e-9)
    }
  })

  it('dwells near golden more than a linear sweep would', () => {
    const amp = 0.9, period = 60, samples = 400
    let eased = 0, linear = 0
    for (let i = 0; i < samples; i++) {
      const t = (i / samples) * period
      if (Math.abs(divergenceAt(base, amp, period, t) - base) < amp * 0.5) eased++
      // Uneased reference: a pure sine sweep of the same amplitude.
      if (Math.abs(amp * Math.sin((2 * Math.PI * t) / period)) < amp * 0.5) linear++
    }
    // The |sin|² easing lingers near golden (~50% of the cycle) vs a raw sine (~33%).
    expect(eased / samples).toBeGreaterThan(0.45)
    expect(eased).toBeGreaterThan(linear)
  })
})

describe('diskRadius', () => {
  it('grows as spacing·√count', () => {
    expect(diskRadius(11, 900)).toBeCloseTo(11 * 30, 6)
    expect(diskRadius(11, 0)).toBe(0)
  })
})

describe('writeFlowPositions (continuous emission)', () => {
  const radiusAt = (out: Float64Array, j: number) => Math.hypot(out[2 * j], out[2 * j + 1])

  it('is deterministic and grows radius with age (youngest at the centre)', () => {
    const a = new Float64Array(2 * 400)
    const b = new Float64Array(2 * 400)
    writeFlowPositions(a, 400, 500.5, 137.507, 11, 0.3, 7)
    writeFlowPositions(b, 400, 500.5, 137.507, 11, 0.3, 7)
    expect(Array.from(a)).toEqual(Array.from(b))
    // j=0 is the newest (age≈frac, near centre); radius increases with j (age).
    expect(radiusAt(a, 0)).toBeLessThan(radiusAt(a, 50))
    expect(radiusAt(a, 50)).toBeLessThan(radiusAt(a, 399))
  })

  it('reports n=floor(spawn) and streams a given floret outward as spawn advances', () => {
    const t0 = new Float64Array(2 * 100)
    const t1 = new Float64Array(2 * 100)
    const r0 = writeFlowPositions(t0, 100, 200, 137.507, 11, 0, 1)
    expect(r0.n).toBe(200)
    // After one more spawn, the floret born at id 200 is now age 1 (was age 0):
    // it sits at index j=1 in the newer frame and its radius has grown from ~0.
    writeFlowPositions(t1, 100, 201, 137.507, 11, 0, 1)
    expect(radiusAt(t1, 1)).toBeGreaterThan(radiusAt(t0, 0))
  })
})
