import { type Genome, crossover, mutate, type GenomeRanges } from './genome'

export interface Scored { genome: Genome; fitness: number }

const EPS = 1e-6

export function roulettePick(scored: Scored[], rng: () => number): Genome {
  const total = scored.reduce((s, x) => s + Math.max(EPS, x.fitness), 0)
  let r = rng() * total
  for (const x of scored) {
    r -= Math.max(EPS, x.fitness)
    if (r <= 0) return x.genome
  }
  return scored[scored.length - 1].genome
}

export function breedGeneration(
  scored: Scored[],
  opts: { eliteCount: number; mutationRate: number; ranges: GenomeRanges },
  rng: () => number,
): Genome[] {
  const ranked = [...scored].sort((a, b) => b.fitness - a.fitness)
  const size = ranked.length
  const elite = Math.min(opts.eliteCount, size)
  const next: Genome[] = ranked.slice(0, elite).map(s => s.genome)
  while (next.length < size) {
    const a = roulettePick(ranked, rng)
    const b = roulettePick(ranked, rng)
    next.push(mutate(crossover(a, b, rng), opts.mutationRate, rng, opts.ranges))
  }
  return next
}
