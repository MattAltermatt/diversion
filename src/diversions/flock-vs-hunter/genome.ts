// genome.ts — flat float-gene genomes for flock + predator. No topology, no
// epistasis → plain uniform per-gene crossover is correct (unlike boxcar2d's truss).
// `skew` biases a gen-0 / immigrant gene toward one end of its range WITHOUT
// leaving the range — an informed prior so the OPENING already flocks (cohesion +
// alignment high) instead of reading as a diffuse gas, and early hunters visibly
// improve their lead. Mutation still roams the full range, so "everything evolvable"
// holds. Each skew consumes exactly one rng() call → randomGenome's call-count is
// unchanged, so determinism (share-link replay) is preserved.
export interface GeneSpec { key: string; min: number; max: number; skew?: 'hi' | 'lo' | 'mid' }
export type Genome = Float32Array // length = spec.length

export const FLOCK_SPEC: GeneSpec[] = [
  { key: 'separationW', min: 0, max: 3, skew: 'mid' }, // some spacing, not a repulsive gas
  { key: 'alignmentW', min: 0, max: 3, skew: 'hi' }, // coherent heading → a moving body
  { key: 'cohesionW', min: 0, max: 3, skew: 'hi' }, // pull together → a murmuration, not a gas
  { key: 'fearW', min: 0, max: 6 }, // can dominate → visible balling/scatter (evolves freely)
  { key: 'fearRadius', min: 20, max: 200 }, // world units
  { key: 'maxSpeed', min: 40, max: 160, skew: 'mid' }, // similar speeds → the flock holds together
]
export const PRED_SPEC: GeneSpec[] = [
  { key: 'lungeThreshold', min: 20, max: 160 },
  { key: 'leadFactor', min: 0, max: 1.5, skew: 'lo' }, // early hunters aim poorly, then evolve to lead
  { key: 'fixation', min: 0, max: 1 },
  // a MODEST speed edge over the flock (40–160) so catches are possible without the
  // predator zipping unnaturally; the lunge is a brief pounce, not a rocket.
  { key: 'maxSpeed', min: 90, max: 150 },
  { key: 'staminaBurst', min: 1.15, max: 1.5 },
]

// Raw gene indices (fixed order — matches *_SPEC above). The per-tick hot loop
// indexes the Float32Array directly with these instead of the string-keyed gene()
// (which allocates a closure + linear-scans per call). gene() stays for cold paths.
export const F = { sep: 0, ali: 1, coh: 2, fear: 3, fearR: 4, spd: 5 } as const
export const P = { lunge: 0, lead: 1, fix: 2, spd: 3, burst: 4 } as const

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Read a gene by its spec key (dev-ergonomic; the hot loop uses raw indices). */
export function gene(g: Genome, spec: GeneSpec[], key: string): number {
  return g[spec.findIndex(s => s.key === key)]
}

/** One rng() call per gene regardless of skew → randomGenome call-count is stable
 *  (determinism). 'hi' → upper half, 'lo' → lower half, 'mid' → middle half. */
function skewed(rng: () => number, skew?: 'hi' | 'lo' | 'mid'): number {
  const r = rng()
  if (skew === 'hi') return 0.5 + 0.5 * r
  if (skew === 'lo') return 0.5 * r
  if (skew === 'mid') return 0.25 + 0.5 * r
  return r
}

export function randomGenome(spec: GeneSpec[], rng: () => number): Genome {
  const g = new Float32Array(spec.length)
  for (let i = 0; i < spec.length; i++) g[i] = lerp(spec[i].min, spec[i].max, skewed(rng, spec[i].skew)) // FIXED order
  return g
}

/** Uniform per-gene crossover — one rng draw per gene, fixed order. */
export function crossover(a: Genome, b: Genome, rng: () => number): Genome {
  const c = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) c[i] = rng() < 0.5 ? a[i] : b[i]
  return c
}

/** Per-gene jitter (±25% of range) with probability `rate`, clamped. No repair
 *  needed — clamping keeps genes valid (no structural constraints). */
export function mutate(g: Genome, rate: number, rng: () => number, spec: GeneSpec[]): Genome {
  const m = new Float32Array(g.length)
  for (let i = 0; i < g.length; i++) {
    const { min, max } = spec[i]
    m[i] = rng() < rate ? clamp(g[i] + (rng() * 2 - 1) * (max - min) * 0.25, min, max) : g[i]
  }
  return m
}
