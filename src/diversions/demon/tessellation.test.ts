import { describe, it, expect } from 'vitest'
import { buildTessellation, type Tessellation } from './tessellation'

function neighbors(t: Tessellation, i: number): number[] {
  return Array.from(t.nbrIdx.subarray(t.nbrStart[i], t.nbrStart[i + 1]))
}
function reciprocal(t: Tessellation): boolean {
  for (let a = 0; a < t.cellCount; a++) {
    for (const b of neighbors(t, a)) if (!neighbors(t, b).includes(a)) return false
  }
  return true
}
function inRange(t: Tessellation): boolean {
  for (const nb of t.nbrIdx) if (nb < 0 || nb >= t.cellCount) return false
  return true
}

describe('square tessellation', () => {
  const t = buildTessellation('square', 10, 100, 100) // 10×10 grid
  it('has cols*rows cells and degree 4', () => {
    expect(t.cellCount).toBe(t.cols * t.rows)
    expect(t.degree).toBe(4)
  })
  it('interior cell has 4 neighbors, corner has 2', () => {
    const interior = 5 * t.cols + 5
    expect(neighbors(t, interior)).toHaveLength(4)
    expect(neighbors(t, 0)).toHaveLength(2) // top-left corner
  })
  it('adjacency is reciprocal and in range', () => {
    expect(reciprocal(t)).toBe(true)
    expect(inRange(t)).toBe(true)
  })
})

describe('hexagon tessellation', () => {
  const t = buildTessellation('hexagon', 10, 200, 200)
  it('degree 6 and interior cell has 6 neighbors', () => {
    expect(t.degree).toBe(6)
    const interior = Math.floor(t.rows / 2) * t.cols + Math.floor(t.cols / 2)
    expect(neighbors(t, interior)).toHaveLength(6)
  })
  it('adjacency is reciprocal and in range', () => {
    expect(reciprocal(t)).toBe(true)
    expect(inRange(t)).toBe(true)
  })
})

describe('triangle tessellation', () => {
  const t = buildTessellation('triangle', 16, 200, 200)
  it('degree 3 and interior cell has 3 neighbors', () => {
    expect(t.degree).toBe(3)
    const interior = Math.floor(t.rows / 2) * t.cols + Math.floor(t.cols / 2)
    expect(neighbors(t, interior)).toHaveLength(3)
  })
  it('adjacency is reciprocal and in range', () => {
    expect(reciprocal(t)).toBe(true)
    expect(inRange(t)).toBe(true)
  })
})
