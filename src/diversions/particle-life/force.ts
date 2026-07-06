// force.ts — the CodeParade / Tom Mohr "beta model" pair force. A species-independent
// repulsion core below `beta`, then a matrix-driven triangular attraction band up to
// the radius. This exact shape is what makes Particle Life form cells and creatures
// instead of collapsing to a point.
//
//   q     = distance / rMax   (normalized, 0..1)
//   a     = attraction matrix entry for the ordered pair, in [-1, 1]
//   beta  = fraction of the radius that is pure repulsion ("personal space")
//
// Returns a scalar in roughly [-1, 1]: negative = push apart, positive = pull
// together. The caller multiplies by the unit direction, rMax and forceScale.
//
// The WGSL kernel in particle-life-gpu/gpu.ts is an EXACT port of this — keep the two
// identical so a seed looks the same on CPU and GPU.

export function force(q: number, a: number, beta: number): number {
  if (q < beta) return q / beta - 1 // ramps -1 (touching) → 0 (at beta): always repel
  // matrix-driven symmetric triangular band, peak `a` at the center, 0 at both ends so
  // it joins the repulsion core continuously.
  if (q < 1) return a * (1 - Math.abs(2 * ((q - beta) / (1 - beta)) - 1))
  return 0 // out of range
}
