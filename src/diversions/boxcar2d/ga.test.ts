import { describe, it, expect } from 'vitest'
import { breedGeneration, rankPick, type Scored } from './ga'
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

describe('rankPick', () => {
  const ranked = (fitnesses: number[]): Scored[] =>
    fitnesses
      .map((f, i) => ({ genome: randomGenome(mulberry32(500 + i)), fitness: f }))
      .sort((a, b) => b.fitness - a.fitness)

  it('returns a genome from the pool', () => {
    const g = rankPick(ranked([1, 2, 3, 4]), mulberry32(3))
    expect(ranked([1, 2, 3, 4]).map(s => s.genome)).toContainEqual(g)
  })

  it('is scale-invariant: adding a constant to every fitness does not change the pick distribution', () => {
    const base = [10, 20, 30, 40, 50]
    const shifted = base.map(f => f + 500) // the +goalDistance baseline that broke roulette
    const tallyByRank = (fs: number[], seed: number) => {
      const pool = ranked(fs)
      const tally = new Map<unknown, number>()
      for (let i = 0; i < 400; i++) {
        const g = rankPick(pool, mulberry32(seed + i))
        tally.set(g, (tally.get(g) ?? 0) + 1)
      }
      return pool.map(s => tally.get(s.genome) ?? 0) // counts in best-first rank order
    }
    expect(tallyByRank(base, 1)).toEqual(tallyByRank(shifted, 1))
  })

  it('prefers the better-ranked genome (best picked more often than worst)', () => {
    const pool = ranked([1, 2, 3, 4, 5])
    let bestPicks = 0, worstPicks = 0
    for (let i = 0; i < 1000; i++) {
      const g = rankPick(pool, mulberry32(i))
      if (g === pool[0].genome) bestPicks++
      if (g === pool[pool.length - 1].genome) worstPicks++
    }
    expect(bestPicks).toBeGreaterThan(worstPicks * 2) // ~1.7/0.3 ≈ 5.7× in the limit
  })
})
