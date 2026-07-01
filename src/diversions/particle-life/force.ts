// force.ts — the CodeParade / Tom Mohr "beta model" pair force. This exact shape
// (a species-independent repulsion core below `beta`, then a matrix-driven
// triangular attract/repel band up to the radius) is what makes Particle Life form
// cells and creatures instead of collapsing to a point.
//
//   q    = distance / rMax   (normalized, 0..1)
//   a    = attraction matrix entry for the ordered pair, in [-1, 1]
//   beta = fraction of the radius that is pure repulsion ("personal space")
//
// Returns a scalar in roughly [-1, 1]: negative = push apart, positive = pull
// together. The caller multiplies by the unit direction, rMax and forceScale.
export function force(q: number, a: number, beta: number): number {
  if (q < beta) return q / beta - 1 // ramps -1 (touching) → 0 (at beta): always repel
  if (q < 1) return a * (1 - Math.abs(2 * q - 1 - beta) / (1 - beta)) // peak = a at q=(1+beta)/2
  return 0 // out of range
}
