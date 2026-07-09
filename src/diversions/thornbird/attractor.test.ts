import { describe, it, expect } from 'vitest'
import {
  step, INITIAL_POINT, sampleFreqs, driftedParams, thornbirdColorT, screenScale,
  type ThornbirdPoint,
} from './attractor'

describe('step (the confirmed thornbird recurrence)', () => {
  it('is deterministic — same input, same output', () => {
    const p: ThornbirdPoint = { x: 0.1, y: 0.2, z: 0.3 }
    const params = { a: 1.99, c: 0.80 }
    expect(step(p, params)).toEqual(step(p, params))
  })

  it('matches the closed form confirmed from hacks/thornbird.c draw_thornbird(): '
    + 'j\'=oldi; i\'=(1-c)*cos(pi*a*oldj)+c*b; b\'=oldj', () => {
    const p: ThornbirdPoint = { x: 0.3, y: 0.5, z: 0.1 }
    const params = { a: 1.99, c: 0.80 }
    const r = step(p, params)
    expect(r.x).toBeCloseTo((1 - params.c) * Math.cos(Math.PI * params.a * p.y) + params.c * p.z, 12)
    expect(r.y).toBe(p.x) // j' = oldi
    expect(r.z).toBe(p.y) // b' = oldj
  })

  it('matches a hand-computed known point', () => {
    // a=1.99, c=0.80, (x,y,z)=(0.3,0.5,0.1) -> nx = 0.2*cos(1.99*pi*0.5) + 0.8*0.1
    const r = step({ x: 0.3, y: 0.5, z: 0.1 }, { a: 1.99, c: 0.80 })
    expect(r.x).toBeCloseTo(-0.11997532649633205, 12)
    expect(r.y).toBeCloseTo(0.3, 12)
    expect(r.z).toBeCloseTo(0.5, 12)
  })

  it('clamps a feedback coefficient >= 1 so the orbit cannot blow up', () => {
    // Without the clamp this exact scenario (c pushed past 1 by the drift wobble)
    // diverges to Infinity within a few thousand iterations — verified during
    // development. c=1.5 should behave identically to the C_MAX clamp (0.98).
    let p: ThornbirdPoint = { ...INITIAL_POINT }
    for (let i = 0; i < 5000; i++) p = step(p, { a: 1.99, c: 1.5 })
    expect(Number.isFinite(p.x)).toBe(true)
    expect(Math.abs(p.x)).toBeLessThanOrEqual(1.0001)
  })

  it('stays bounded within [-1, 1] for 50k steps across the exposed parameter range', () => {
    const combos = [
      { a: 1.99, c: 0.80 }, { a: 2.15, c: 0.92 }, { a: 1.55, c: 0.55 },
      { a: 2.4, c: 0.95 }, { a: 1.2, c: 0.3 }, { a: 2.9, c: 0.2 }, { a: 1.0, c: 0.1 },
    ]
    // Hoist assertions out of the hot loop — 7×50k inline expect() calls blow
    // the 5s CI budget (#117, gotcha-ci-test-timeout-hot-loop-expect). Track the
    // worst case in locals and assert once per combo.
    for (const params of combos) {
      let p: ThornbirdPoint = { ...INITIAL_POINT }
      let allFinite = true
      let maxAbsX = 0
      for (let i = 0; i < 50000; i++) {
        p = step(p, params)
        if (!Number.isFinite(p.x)) allFinite = false
        const absX = Math.abs(p.x)
        if (absX > maxAbsX) maxAbsX = absX
      }
      expect(allFinite).toBe(true)
      expect(maxAbsX).toBeLessThanOrEqual(1.0001)
    }
  })
})

describe('sampleFreqs', () => {
  it('is deterministic per seed', () => {
    expect(sampleFreqs(12345)).toEqual(sampleFreqs(12345))
  })

  it('different seeds produce different wobble periods', () => {
    const a = sampleFreqs(1)
    const b = sampleFreqs(2)
    expect(a).not.toEqual(b)
  })

  it('returns positive periods (never a divide-by-zero rate)', () => {
    for (const seed of [0, 1, 7, 42, 99999]) {
      const f = sampleFreqs(seed)
      expect(f.t1).toBeGreaterThan(0)
      expect(f.t2).toBeGreaterThan(0)
    }
  })
})

describe('driftedParams', () => {
  const freqs = sampleFreqs(7)

  it('drift=0 is frozen (equals base for any t)', () => {
    expect(driftedParams(1.99, 0.80, freqs, 0, 0)).toEqual({ a: 1.99, c: 0.80 })
    expect(driftedParams(1.99, 0.80, freqs, 999999, 0)).toEqual({ a: 1.99, c: 0.80 })
  })

  it('wobbles a and c around their base values when drift > 0', () => {
    const p = driftedParams(1.99, 0.80, freqs, 12345, 1)
    expect(p.a).not.toBe(1.99)
    expect(p.c).not.toBe(0.80)
    // amplitude bound: a's wobble is at most AMP_A1+AMP_A2 = 0.45; c's is at most 0.20
    expect(Math.abs(p.a - 1.99)).toBeLessThanOrEqual(0.45 + 1e-9)
    expect(Math.abs(p.c - 0.80)).toBeLessThanOrEqual(0.20 + 1e-9)
  })
})

describe('thornbirdColorT', () => {
  it('radius is 0 at center, 1 at the edge', () => {
    expect(thornbirdColorT('radius', 50, 50, 50, 50, 50, 100, 100)).toBeCloseTo(0, 6)
    expect(thornbirdColorT('radius', 100, 50, 50, 50, 50, 100, 100)).toBeCloseTo(1, 6)
  })

  it('x / y sources are clamped screen fractions', () => {
    expect(thornbirdColorT('x', 25, 0, 50, 50, 50, 100, 100)).toBeCloseTo(0.25, 6)
    expect(thornbirdColorT('y', 0, 80, 50, 50, 50, 100, 100)).toBeCloseTo(0.8, 6)
    expect(thornbirdColorT('x', 999, 0, 50, 50, 50, 100, 100)).toBe(1) // clamp high
  })
})

describe('screenScale', () => {
  it('returns a positive pixels-per-world-unit scale', () => {
    expect(screenScale(800, 600)).toBeGreaterThan(0)
  })
})
