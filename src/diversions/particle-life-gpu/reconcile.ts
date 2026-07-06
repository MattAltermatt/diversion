import type { ParticleLifeGpuConfig } from './schema'

/** Enforce the matrix truth-model when a generator field changes. Pure. */
export function reconcileMatrix(
  prev: ParticleLifeGpuConfig, next: ParticleLifeGpuConfig,
): ParticleLifeGpuConfig {
  // Effective matrix seed / Species → rebuild: drop any Custom override (omit the
  // key). The matrix follows matrixSeed, or the soup seed when matrixSeed is 0 (#205),
  // so a change to whichever currently drives the table clears a hand-tuned override.
  const effPrev = prev.matrixSeed || prev.seed
  const effNext = next.matrixSeed || next.seed
  if (effNext !== effPrev || next.colors !== prev.colors) {
    const { matrix: _omit, ...rest } = next
    return rest as ParticleLifeGpuConfig
  }
  // Symmetry flip → live transform on a Custom matrix (no reroll).
  const n = next.colors
  if (next.symmetry !== prev.symmetry && Array.isArray(next.matrix) && next.matrix.length === n * n) {
    if (next.symmetry === 'Symmetric') {
      const m = next.matrix.slice()
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) m[j * n + i] = m[i * n + j]
      return { ...next, matrix: m }
    }
    return next // → Asymmetric: values unchanged, pairs just unlock
  }
  // Attraction-bias defers; plain matrix edits pass through.
  return next
}
