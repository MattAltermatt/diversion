import { makeNoise3D } from '../../framework/rng'

export interface RubbleLayout {
  /** world-x of a slot's block center (strictly increasing in slot). */
  blockX(slot: number): number
  /** edge length (meters) of a slot's block. */
  blockSize(slot: number): number
  /** first slot whose blockX is roughly >= x (for repopulating from a spawn point). */
  firstSlotAtOrAfter(x: number): number
}

/** Deterministic, resettable obstacle layout. `density` = blocks per ~10 m.
 *  Returns null when density <= 0. PURE function of `seed` (uses makeNoise3D, not
 *  the GA rng) so it can never perturb run determinism. Jitter stays under
 *  0.3·spacing, which keeps blockX strictly monotonic. */
export function makeRubbleLayout(seed: number, density: number): RubbleLayout | null {
  if (density <= 0) return null
  const spacing = 10 / density
  const j = makeNoise3D((seed ^ 0x5151b10c) >>> 0) // independent stream
  return {
    blockX: (slot) => slot * spacing + j(slot, 0, 0) * spacing * 0.3,
    blockSize: (slot) => 0.18 + (j(slot, 7, 0) * 0.5 + 0.5) * 0.22, // 0.18 .. 0.40 m (small pebbles)
    firstSlotAtOrAfter: (x) => Math.ceil(x / spacing),
  }
}
