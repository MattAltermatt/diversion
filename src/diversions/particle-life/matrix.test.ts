import { describe, it, expect } from 'vitest'
import { buildMatrix, attraction } from './matrix'

describe('buildMatrix', () => {
  it('is deterministic for a given seed', () => {
    const a = buildMatrix(6, 1337, 'Asymmetric', 0.1)
    const b = buildMatrix(6, 1337, 'Asymmetric', 0.1)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('rolls a different table for a different seed', () => {
    const a = buildMatrix(6, 1, 'Asymmetric', 0)
    const b = buildMatrix(6, 2, 'Asymmetric', 0)
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })

  it('Symmetric mirrors across the diagonal; Asymmetric generally does not', () => {
    const n = 6
    const sym = buildMatrix(n, 42, 'Symmetric', 0)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        expect(attraction(sym, n, i, j)).toBeCloseTo(attraction(sym, n, j, i), 6)

    const asym = buildMatrix(n, 42, 'Asymmetric', 0)
    let anyDiff = false
    for (let i = 0; i < n && !anyDiff; i++)
      for (let j = 0; j < n; j++)
        if (Math.abs(attraction(asym, n, i, j) - attraction(asym, n, j, i)) > 1e-6) { anyDiff = true; break }
    expect(anyDiff).toBe(true)
  })

  it('bias shifts the mean toward attraction and stays clamped to [-1, 1]', () => {
    const n = 8
    const neutral = buildMatrix(n, 7, 'Asymmetric', 0)
    const biased = buildMatrix(n, 7, 'Asymmetric', 0.5)
    const mean = (m: Float32Array) => m.reduce((s, v) => s + v, 0) / m.length
    expect(mean(biased)).toBeGreaterThan(mean(neutral))
    for (const v of biased) expect(v).toBeGreaterThanOrEqual(-1), expect(v).toBeLessThanOrEqual(1)
  })

  it('matrix is exactly n×n', () => {
    expect(buildMatrix(3, 1, 'Asymmetric', 0).length).toBe(9)
    expect(buildMatrix(8, 1, 'Asymmetric', 0).length).toBe(64)
  })
})
