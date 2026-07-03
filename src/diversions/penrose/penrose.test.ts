import { describe, it, expect } from 'vitest'
import { buildTiling, seededRot } from './penrose'

describe('buildTiling', () => {
  it('starts as a 10-triangle sun and deflates deterministically', () => {
    expect(buildTiling(0, 0).length / 7).toBe(10) // the initial wheel
    // one deflation: every narrow half-tile → 2 children → 20
    expect(buildTiling(1, 0).length / 7).toBe(20)
  })
  it('grows with depth', () => {
    const a = buildTiling(3, 0).length
    const b = buildTiling(5, 0).length
    expect(b).toBeGreaterThan(a)
  })
  it('is deterministic per (depth, rotation) and varies with rotation', () => {
    expect([...buildTiling(4, 0.5)]).toEqual([...buildTiling(4, 0.5)])
    expect([...buildTiling(4, 0.5)]).not.toEqual([...buildTiling(4, 1.3)])
  })
  it('produces only valid tile types (0 or 1) and finite coords', () => {
    const t = buildTiling(4, 0)
    for (let i = 0; i < t.length / 7; i++) {
      expect([0, 1]).toContain(t[i * 7])
      for (let k = 1; k < 7; k++) expect(Number.isFinite(t[i * 7 + k])).toBe(true)
    }
  })
})

describe('seededRot', () => {
  it('is deterministic per seed and differs across seeds, within [0, 2π)', () => {
    expect(seededRot(7)).toBe(seededRot(7))
    expect(seededRot(7)).not.toBe(seededRot(8))
    expect(seededRot(7)).toBeGreaterThanOrEqual(0)
    expect(seededRot(7)).toBeLessThan(Math.PI * 2)
  })
})
