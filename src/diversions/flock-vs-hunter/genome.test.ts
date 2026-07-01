import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../../framework/rng'
import { FLOCK_SPEC, PRED_SPEC, randomGenome, crossover, mutate, gene } from './genome'

describe('genome', () => {
  it('randomGenome produces one in-range value per gene, deterministically', () => {
    const a = randomGenome(FLOCK_SPEC, mulberry32(1))
    const b = randomGenome(FLOCK_SPEC, mulberry32(1))
    expect(Array.from(a)).toEqual(Array.from(b))
    expect(a.length).toBe(FLOCK_SPEC.length)
    FLOCK_SPEC.forEach((s, i) => {
      expect(a[i]).toBeGreaterThanOrEqual(s.min)
      expect(a[i]).toBeLessThanOrEqual(s.max)
    })
  })

  it('crossover child gene equals one of the two parents at each index', () => {
    const rng = mulberry32(7)
    const a = randomGenome(PRED_SPEC, mulberry32(2))
    const b = randomGenome(PRED_SPEC, mulberry32(3))
    const c = crossover(a, b, rng)
    for (let i = 0; i < c.length; i++) expect([a[i], b[i]]).toContain(c[i])
  })

  it('mutate stays clamped to range even at rate 1', () => {
    const g = randomGenome(FLOCK_SPEC, mulberry32(4))
    const m = mutate(g, 1, mulberry32(5), FLOCK_SPEC)
    FLOCK_SPEC.forEach((s, i) => {
      expect(m[i]).toBeGreaterThanOrEqual(s.min)
      expect(m[i]).toBeLessThanOrEqual(s.max)
    })
  })

  it('gene() reads a named gene by spec key', () => {
    const g = randomGenome(FLOCK_SPEC, mulberry32(6))
    expect(gene(g, FLOCK_SPEC, 'maxSpeed')).toBe(g[FLOCK_SPEC.findIndex(s => s.key === 'maxSpeed')])
  })
})
