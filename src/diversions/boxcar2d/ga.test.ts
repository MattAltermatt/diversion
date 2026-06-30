import { describe, it, expect } from 'vitest'
import { breedGeneration, roulettePick, type Scored } from './ga'
import { randomGenome, DEFAULT_RANGES } from './genome'
import { mulberry32 } from '../../framework/rng'

const pop = (n: number, seed: number): Scored[] =>
  Array.from({ length: n }, (_, i) => ({ genome: randomGenome(mulberry32(seed + i)), fitness: i }))

describe('breedGeneration', () => {
  it('preserves population size and carries the elite unchanged', () => {
    const scored = pop(6, 100)
    const champ = scored.reduce((a, b) => (b.fitness > a.fitness ? b : a)).genome
    const next = breedGeneration(scored, { eliteCount: 2, mutationRate: 0.1, ranges: DEFAULT_RANGES }, mulberry32(1))
    expect(next).toHaveLength(6)
    expect(next[0]).toEqual(champ) // highest-fitness genome carried verbatim as elite #1
  })

  it('is deterministic for a given rng seed', () => {
    const scored = pop(6, 100)
    const a = breedGeneration(scored, { eliteCount: 1, mutationRate: 0.2, ranges: DEFAULT_RANGES }, mulberry32(42))
    const b = breedGeneration(scored, { eliteCount: 1, mutationRate: 0.2, ranges: DEFAULT_RANGES }, mulberry32(42))
    expect(a).toEqual(b)
  })
})

describe('roulettePick', () => {
  it('returns a genome from the pool', () => {
    const scored = pop(4, 200)
    const g = roulettePick(scored, mulberry32(3))
    expect(scored.map(s => s.genome)).toContainEqual(g)
  })
})
