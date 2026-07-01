import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../../framework/rng'
import { FLOCK_SPEC, randomGenome } from './genome'
import { breedGeneration, annealedRate, type Scored } from './ga'

const pool = (rng: () => number): Scored[] =>
  Array.from({ length: 8 }, (_, i) => ({ genome: randomGenome(FLOCK_SPEC, rng), fitness: i }))

describe('ga', () => {
  it('breedGeneration is deterministic for a fixed rng + pool', () => {
    const p = pool(mulberry32(1))
    const a = breedGeneration(p, { eliteCount: 2, mutationRate: 0.1, spec: FLOCK_SPEC }, mulberry32(9))
    const b = breedGeneration(p, { eliteCount: 2, mutationRate: 0.1, spec: FLOCK_SPEC }, mulberry32(9))
    expect(a.map(g => Array.from(g))).toEqual(b.map(g => Array.from(g)))
  })

  it('preserves population size and copies the top elite verbatim', () => {
    const p = pool(mulberry32(2))
    const next = breedGeneration(p, { eliteCount: 2, mutationRate: 0, spec: FLOCK_SPEC }, mulberry32(3))
    expect(next.length).toBe(p.length)
    const topGenome = [...p].sort((a, b) => b.fitness - a.fitness)[0].genome
    expect(Array.from(next[0])).toEqual(Array.from(topGenome))
  })

  it('annealedRate cools a peak toward 25% over 8 generations', () => {
    expect(annealedRate(0.2, 1)).toBeCloseTo(0.2)
    expect(annealedRate(0.2, 9)).toBeCloseTo(0.05)
  })
})
