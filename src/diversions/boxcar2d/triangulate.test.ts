import { describe, it, expect } from 'vitest'
import { triangulateEdges } from './triangulate'

const nodesCovered = (edges: [number, number][], n: number) => {
  const seen = new Set<number>()
  for (const [a, b] of edges) { seen.add(a); seen.add(b) }
  return seen.size === n
}

describe('triangulateEdges', () => {
  it('a single triangle yields its 3 edges', () => {
    const e = triangulateEdges([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 2 }])
    expect(e).toHaveLength(3)
    expect(nodesCovered(e, 3)).toBe(true)
  })

  it('a convex quad yields 5 edges (4 sides + 1 diagonal), all nodes connected', () => {
    const e = triangulateEdges([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 }])
    expect(e).toHaveLength(5)
    expect(nodesCovered(e, 4)).toBe(true)
  })

  it('collinear points fall back to a connecting chain (n-1 edges, all covered)', () => {
    const e = triangulateEdges([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }])
    expect(e).toHaveLength(3)
    expect(nodesCovered(e, 4)).toBe(true)
  })

  it('fewer than 3 points → chain', () => {
    expect(triangulateEdges([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([[0, 1]])
  })

  it('is deterministic (same input → same edges)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 2, y: 0.3 }, { x: 1.5, y: 2 }, { x: -0.5, y: 1.6 }, { x: 0.8, y: 0.9 }]
    const norm = (e: [number, number][]) => e.map(([a, b]) => `${a}-${b}`).sort()
    expect(norm(triangulateEdges(pts))).toEqual(norm(triangulateEdges(pts)))
  })
})
