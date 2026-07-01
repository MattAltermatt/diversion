// force.ts — the CodeParade / Tom Mohr "beta model" pair force. This exact shape
// (a species-independent repulsion core below `beta`, then a matrix-driven band up
// to the radius) is what makes Particle Life form cells and creatures instead of
// collapsing to a point.
//
//   q     = distance / rMax   (normalized, 0..1)
//   a     = attraction matrix entry for the ordered pair, in [-1, 1]
//   beta  = fraction of the radius that is pure repulsion ("personal space")
//   curve = which SHAPE the attract/repel band takes (#206) — the repulsion core is
//           identical for every curve, so none of them can collapse to a dot; only
//           the band between `beta` and 1 changes, which visibly shifts the emergent
//           regime (equilibrium distance, filament length, banding).
//
// Returns a scalar in roughly [-1, 1]: negative = push apart, positive = pull
// together. The caller multiplies by the unit direction, rMax and forceScale.
//
// The WGSL kernel in particle-life-gpu/gpu.ts is an EXACT port of this — keep the
// two branch-for-branch identical so a seed looks the same on CPU and GPU.

// Named band shapes, index-aligned with the schema enum + the WGSL `curve` uniform.
export const FORCE_CURVES = ['Standard', 'Smooth', 'Long-range', 'Stepped'] as const
export type ForceCurve = (typeof FORCE_CURVES)[number]

/** Enum name → the integer id packed into the GPU uniform / passed to `force`. */
export function forceCurveId(name: ForceCurve | string): number {
  const i = (FORCE_CURVES as readonly string[]).indexOf(name)
  return i < 0 ? 0 : i
}

const PI = Math.PI

/** The band value at normalized position s ∈ [0,1] (s = 0 at `beta`, 1 at the radius),
 *  before scaling by the matrix coefficient `a`. Peaks at 1; 0 at both ends (so it
 *  joins the repulsion core continuously). `curve` selects the shape. */
function band(s: number, curve: number): number {
  switch (curve) {
    case 1: // Smooth — raised-sine arch: same symmetric peak, no force kink at the top
      return Math.sin(PI * s)
    case 2: // Long-range — asymmetric tent peaked early (s=0.2): a long, gentle
      // attraction tail out to the radius → sweeping continents, longer filaments
      return s < 0.2 ? s / 0.2 : (1 - s) / 0.8
    case 3: // Stepped — quantized sine into flat plateaus → crisp crystalline banding.
      // (WGSL round() is half-to-even vs JS half-up — they differ only on the measure-
      // zero set where sin·3 lands exactly on ±0.5/±1.5, visually irrelevant.)
      return Math.round(Math.sin(PI * s) * 3) / 3
    default: // 0 Standard — the classic symmetric triangular tent, peak at s=0.5
      return 1 - Math.abs(2 * s - 1)
  }
}

export function force(q: number, a: number, beta: number, curve = 0): number {
  if (q < beta) return q / beta - 1 // ramps -1 (touching) → 0 (at beta): always repel
  if (q < 1) return a * band((q - beta) / (1 - beta), curve) // matrix-driven band
  return 0 // out of range
}
