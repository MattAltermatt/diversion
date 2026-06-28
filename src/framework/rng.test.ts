import { describe, it, expect } from 'vitest'
import { mulberry32, makeNoise3D } from './rng'

describe('mulberry32', () => {
  it('is deterministic: same seed → same sequence', () => {
    const a = mulberry32(12345)
    const b = mulberry32(12345)
    const seqA = Array.from({ length: 8 }, () => a())
    const seqB = Array.from({ length: 8 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('produces different streams for different seeds', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect(a()).not.toEqual(b())
  })

  it('emits floats in [0, 1)', () => {
    const r = mulberry32(99)
    for (let i = 0; i < 1000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('matches the pinned reference sequence for seed 1 (regression guard)', () => {
    // Locks the exact algorithm — these values must never drift (determinism
    // is a contract: a shared seed reproduces the same art everywhere).
    const r = mulberry32(1)
    const first = [r(), r(), r()]
    expect(first[0]).toBeCloseTo(0.6270739405881613, 12)
    expect(first[1]).toBeCloseTo(0.002735721180215478, 12)
    expect(first[2]).toBeCloseTo(0.5274470399599522, 12)
  })
})

describe('makeNoise3D', () => {
  it('is deterministic for a given seed', () => {
    const n1 = makeNoise3D(7)
    const n2 = makeNoise3D(7)
    for (const [x, y, z] of [[0.1, 0.2, 0.3], [3.7, 9.1, 0.0], [-2.5, 4.25, 11.1]]) {
      expect(n1(x, y, z)).toEqual(n2(x, y, z))
    }
  })

  it('differs across seeds', () => {
    const a = makeNoise3D(1)
    const b = makeNoise3D(2)
    expect(a(0.3, 0.7, 0.5)).not.toEqual(b(0.3, 0.7, 0.5))
  })

  it('stays within [-1, 1]', () => {
    const n = makeNoise3D(42)
    const r = mulberry32(42)
    for (let i = 0; i < 500; i++) {
      const v = n(r() * 50, r() * 50, r() * 50)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('interpolates smoothly (lattice corners reproduce across calls)', () => {
    const n = makeNoise3D(3)
    expect(n(1, 1, 1)).toEqual(n(1, 1, 1))
  })
})
