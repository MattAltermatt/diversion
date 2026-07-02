import { type Genome, crossover, mutate, type GenomeRanges } from './genome'

export interface Scored { genome: Genome; fitness: number }

// Linear-ranking selection. `ranked` MUST be sorted best-first. Weight by RANK,
// not raw fitness, so selection is scale-invariant: it cannot be washed out by the
// `+goalDistance` additive baseline that crushes every finisher into a ~1.02× band
// under raw-fitness roulette. Slope s=1.7 → best ≈ 1.7×, worst ≈ 0.3× mean pressure.
// One rng() draw per pick → deterministic (share-link keystone holds).
const RANK_SLOPE = 1.7 // 1 = uniform, 2 = maximal linear pressure

export function rankPick(ranked: Scored[], rng: () => number): Genome {
  const n = ranked.length
  if (n === 1) return ranked[0].genome
  // weight(rank i, 0=best) = 2 − s + 2(s−1)·(n−1−i)/(n−1); sums to n.
  const weight = (i: number) => 2 - RANK_SLOPE + 2 * (RANK_SLOPE - 1) * ((n - 1 - i) / (n - 1))
  let r = rng() * n // Σ weights == n by construction
  for (let i = 0; i < n; i++) {
    r -= weight(i)
    if (r <= 0) return ranked[i].genome
  }
  return ranked[n - 1].genome
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
    const a = rankPick(ranked, rng)
    const b = rankPick(ranked, rng)
    next.push(mutate(crossover(a, b, rng), opts.mutationRate, rng, opts.ranges))
  }
  return next
}
