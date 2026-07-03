import { describe, it, expect } from 'vitest'
import { orient, buildArcs } from './truchet'

describe('orient', () => {
  it('is deterministic per (r,c,seed) and always 0 or 1', () => {
    expect(orient(3, 5, 1)).toBe(orient(3, 5, 1))
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      expect([0, 1]).toContain(orient(r, c, 7))
    }
  })
  it('varies across cells and seeds (both orientations appear)', () => {
    const seen = new Set<number>()
    for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) seen.add(orient(r, c, 2))
    expect(seen.size).toBe(2)
    // a different seed reshuffles at least some tiles
    let diff = 0
    for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) if (orient(r, c, 2) !== orient(r, c, 3)) diff++
    expect(diff).toBeGreaterThan(0)
  })
})

describe('buildArcs', () => {
  it('emits two quarter-arcs per tile covering the screen', () => {
    const ts = 50
    const arcs = buildArcs(500, 300, ts, 1) // 10×6 tiles
    expect(arcs.length).toBe(10 * 6 * 2 * 3)
  })
  it('is deterministic per seed and stable when the grid grows (existing tiles keep orientation)', () => {
    const small = buildArcs(200, 200, 50, 1) // 4×4
    const large = buildArcs(300, 200, 50, 1) // 6×4
    // the first 4 columns' arcs must be identical (stable hash → no reshuffle)
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const si = (r * 4 + c) * 6
        const li = (r * 6 + c) * 6
        for (let k = 0; k < 6; k++) expect(small[si + k]).toBe(large[li + k])
      }
    }
  })
})
