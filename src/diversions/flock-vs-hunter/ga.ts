// ga.ts — the BoxCar2D GA shape (roulette + elite + crossover + mutate), made
// generic over Float32Array genomes. Deterministic: fixed rng call order.
import { type Genome, type GeneSpec, crossover, mutate } from './genome'

export interface Scored { genome: Genome; fitness: number }

const EPS = 1e-6
const ANNEAL_GENS = 8
const MUTATION_FLOOR_FRAC = 0.25

/** Mutation rate for a generation: gen-1 peak → floor (peak·0.25) by gen 9. */
export function annealedRate(peak: number, generation: number): number {
  const floor = peak * MUTATION_FLOOR_FRAC
  const t = Math.min(1, Math.max(0, (generation - 1) / ANNEAL_GENS))
  return peak + (floor - peak) * t
}

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
  opts: { eliteCount: number; mutationRate: number; spec: GeneSpec[] },
  rng: () => number,
): Genome[] {
  const ranked = [...scored].sort((a, b) => b.fitness - a.fitness)
  const size = ranked.length
  const elite = Math.min(opts.eliteCount, size)
  const next: Genome[] = ranked.slice(0, elite).map(s => s.genome)
  while (next.length < size) {
    const a = roulettePick(ranked, rng)
    const b = roulettePick(ranked, rng)
    next.push(mutate(crossover(a, b, rng), opts.mutationRate, rng, opts.spec))
  }
  return next
}
