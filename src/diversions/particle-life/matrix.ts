// matrix.ts — the interaction matrix is DERIVED from the seed (Option A), never
// edited cell-by-cell. `seed` rolls an n×n table of attract/repel coefficients in
// [-1, 1]; `symmetry` and `attractBias` shape its character. Rerolling the seed is
// how you get a whole new "world". (A bespoke editable grid is BACKLOG, shared
// with demon #77.)
import { mulberry32 } from '../../framework/rng'

export type Symmetry = 'Asymmetric' | 'Symmetric'

const clamp1 = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v)

/** Flat row-major n×n matrix. `attraction(m, n, i, j)` = row i (feeler) → col j
 *  (neighbour). Asymmetric means A→B and B→A can differ — the source of chases,
 *  tails and self-replicating structures. */
export function buildMatrix(n: number, seed: number, symmetry: Symmetry, bias: number): Float32Array {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0)
  const m = new Float32Array(n * n)
  if (symmetry === 'Symmetric') {
    // upper triangle incl. diagonal, mirrored — deterministic draw order
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const v = rng() * 2 - 1
        m[i * n + j] = v
        m[j * n + i] = v
      }
    }
  } else {
    for (let k = 0; k < n * n; k++) m[k] = rng() * 2 - 1
  }
  for (let k = 0; k < n * n; k++) m[k] = clamp1(m[k] + bias)
  return m
}

/** Attraction coefficient for feeler species `i` toward neighbour species `j`. */
export function attraction(m: Float32Array, n: number, i: number, j: number): number {
  return m[i * n + j]
}
