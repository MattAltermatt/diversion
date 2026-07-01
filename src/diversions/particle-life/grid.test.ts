import { describe, it, expect } from 'vitest'
import { ParticleGrid, wrapDelta } from './grid'

describe('wrapDelta', () => {
  it('maps into (-size/2, size/2]', () => {
    expect(wrapDelta(10, 100)).toBe(10)
    expect(wrapDelta(90, 100)).toBe(-10) // shorter way round is backwards
    expect(wrapDelta(-90, 100)).toBe(10)
    expect(wrapDelta(0, 100)).toBe(0)
  })
})

describe('ParticleGrid', () => {
  const build = (xs: number[], ys: number[]) => {
    const px = Float32Array.from(xs), py = Float32Array.from(ys)
    const g = new ParticleGrid(100, 100, 20, xs.length) // 5×5 cells
    g.rebuild(px, py, xs.length)
    return { g, px, py }
  }

  it('finds a near neighbour and excludes self + far particles', () => {
    const { g, px, py } = build([50, 58, 12], [50, 50, 12]) // A, B(near), C(far)
    const n = g.neighborsWithin(px, py, 0, 15)
    const found = Array.from(g.outIdx.slice(0, n))
    expect(found).toContain(1)
    expect(found).not.toContain(0) // never self
    expect(found).not.toContain(2) // C is out of range
  })

  it('finds neighbours across the toroidal seam with min-image deltas', () => {
    const { g, px, py } = build([5, 95], [5, 5]) // A near left edge, B near right edge
    const n = g.neighborsWithin(px, py, 0, 15)
    expect(n).toBe(1)
    // shortest path from A(5) to B(95) wraps left: dx = -10, dy = 0
    expect(g.outDX[0]).toBeCloseTo(-10, 5)
    expect(g.outDY[0]).toBeCloseTo(0, 5)
  })

  it('reports a symmetric-magnitude delta from the other side', () => {
    const { g, px, py } = build([5, 95], [5, 5])
    const n = g.neighborsWithin(px, py, 1, 15) // from B's perspective
    expect(n).toBe(1)
    expect(g.outDX[0]).toBeCloseTo(10, 5) // B(95) → A(5) wraps right: +10
  })
})
