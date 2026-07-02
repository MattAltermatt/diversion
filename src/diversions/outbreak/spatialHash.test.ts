import { describe, it, expect } from 'vitest'
import { SpatialHash } from './spatialHash'

describe('SpatialHash (bounded, non-toroidal)', () => {
  it('finds a genuine neighbour within radius', () => {
    const h = new SpatialHash(1000, 1000, 100)
    const px = new Float32Array([100, 130, 500])
    const py = new Float32Array([100, 100, 500])
    const alive = new Uint8Array([1, 1, 1])
    h.rebuild(px, py, 3, alive)
    const out: number[] = []
    h.neighborsWithin(px, py, 0, 50, 8, out)
    expect(out).toContain(1) // 30px away
    expect(out).not.toContain(2) // ~566px away
  })

  it('does NOT wrap: an agent at the left edge never sees one at the right edge', () => {
    const h = new SpatialHash(1000, 1000, 100)
    const px = new Float32Array([5, 995]) // opposite edges — 990px apart, or 10px if it wrapped
    const py = new Float32Array([500, 500])
    const alive = new Uint8Array([1, 1])
    h.rebuild(px, py, 2, alive)
    const out: number[] = []
    h.neighborsWithin(px, py, 0, 50, 8, out)
    expect(out).toHaveLength(0) // a toroidal hash would (wrongly) report the wrap-neighbour
    expect(h.nearestWithin(px, py, 0, 50, alive)).toBe(-1)
  })

  it('nearestWithin returns the closest, filters by faction, and skips the dead', () => {
    const h = new SpatialHash(1000, 1000, 100)
    const px = new Float32Array([100, 140, 120, 160])
    const py = new Float32Array([100, 100, 100, 100])
    const faction = new Uint8Array([0, 1, 2, 1])
    const alive = new Uint8Array([1, 1, 1, 1])
    h.rebuild(px, py, 4, alive)
    // nearest FIGHTER (faction 1) to agent 0: index 2 is closer (20px) but is a zombie;
    // among fighters, index 1 (40px) beats index 3 (60px).
    expect(h.nearestWithin(px, py, 0, 100, alive, faction, 1)).toBe(1)
    alive[1] = 0 // kill the near fighter → falls back to the far one
    h.rebuild(px, py, 4, alive)
    expect(h.nearestWithin(px, py, 0, 100, alive, faction, 1)).toBe(3)
  })
})
