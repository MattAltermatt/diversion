// matrixTransforms.ts — pure Config-agnostic transforms for the interaction-matrix
// editor's one-click preset buttons (#220). Each returns a fresh flat row-major n×n
// matrix (values clamped to −1…1) that the editor writes as a Custom override, so it
// rides the share-link exactly like a hand-dragged edit. Generators ignore the current
// matrix; `invert` transforms it. Kept free of any diversion math (mirrors the rest of
// the generic control) so it stays unit-testable and reusable.

/** Every pair attracts (one dense blob — personal-space beta still keeps it airy). */
export function allAttract(n: number): number[] {
  return new Array(n * n).fill(1)
}

/** Every pair repels (a skittish, evenly-spread gas). */
export function allRepel(n: number): number[] {
  return new Array(n * n).fill(-1)
}

/** Self-attract, cross-repel — tight single-species clumps that shun other colors. */
export function identity(n: number): number[] {
  const out = new Array(n * n).fill(-1)
  for (let i = 0; i < n; i++) out[i * n + i] = 1
  return out
}

/** Chase / cyclic (rock-paper-scissors trains): species i attracts i+1 and repels i−1,
 *  so colors form directional pursuit chains around the wheel. */
export function chase(n: number): number[] {
  const out = new Array(n * n).fill(0)
  for (let i = 0; i < n; i++) {
    out[i * n + ((i + 1) % n)] = 1 // attract the next species
    out[i * n + ((i + n - 1) % n)] = -1 // flee the previous one
  }
  return out
}

/** Fresh random matrix in −1…1, independent of the seed. `rng` defaults to Math.random
 *  (a UI action, so nondeterminism is fine); injectable for tests. */
export function randomize(n: number, rng: () => number = Math.random): number[] {
  const out = new Array(n * n)
  for (let k = 0; k < n * n; k++) out[k] = rng() * 2 - 1
  return out
}

/** Negate the current matrix — attractions become repulsions and vice-versa. */
export function invert(m: number[]): number[] {
  return m.map((v) => -v)
}
