import { describe, it, expect } from 'vitest'
import { randomGenome, N_VERTICES, N_WHEELS, DEFAULT_RANGES, crossover, mutate } from './genome'
import { mulberry32 } from '../../framework/rng'

describe('randomGenome', () => {
  it('produces a fixed-length, in-range genome', () => {
    const g = randomGenome(mulberry32(1))
    expect(g.mags).toHaveLength(N_VERTICES)
    expect(g.wheels).toHaveLength(N_WHEELS)
    for (const m of g.mags) {
      expect(m).toBeGreaterThanOrEqual(DEFAULT_RANGES.magMin)
      expect(m).toBeLessThanOrEqual(DEFAULT_RANGES.magMax)
    }
    for (const w of g.wheels) {
      expect(w.vertex).toBeGreaterThanOrEqual(0)
      expect(w.vertex).toBeLessThan(N_VERTICES)
      expect(Number.isInteger(w.vertex)).toBe(true)
    }
  })

  it('is deterministic for a given seed', () => {
    expect(randomGenome(mulberry32(7))).toEqual(randomGenome(mulberry32(7)))
  })
})

describe('crossover', () => {
  it('every gene comes from one of the two parents (deterministic)', () => {
    const a = randomGenome(mulberry32(1)); const b = randomGenome(mulberry32(2))
    const child = crossover(a, b, mulberry32(3))
    child.mags.forEach((m, i) => expect([a.mags[i], b.mags[i]]).toContain(m))
    expect(crossover(a, b, mulberry32(3))).toEqual(crossover(a, b, mulberry32(3)))
  })
})

describe('mutate', () => {
  it('rate 0 returns an identical-valued genome', () => {
    const g = randomGenome(mulberry32(5))
    expect(mutate(g, 0, mulberry32(9))).toEqual(g)
  })
  it('keeps genome valid and stays in range', () => {
    const g = randomGenome(mulberry32(5))
    const m = mutate(g, 1, mulberry32(9))
    expect(m.mags).toHaveLength(N_VERTICES)
    m.mags.forEach(v => { expect(v).toBeGreaterThanOrEqual(DEFAULT_RANGES.magMin); expect(v).toBeLessThanOrEqual(DEFAULT_RANGES.magMax) })
    m.wheels.forEach(w => { expect(w.vertex).toBeGreaterThanOrEqual(0); expect(w.vertex).toBeLessThan(N_VERTICES) })
  })
})
