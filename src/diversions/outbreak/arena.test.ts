import { describe, it, expect } from 'vitest'
import { generateArena, insideWall, resolveWall, addWallAvoid, ARENA_MX } from './arena'

const W = 1600, H = 900

describe('arena generation', () => {
  it('an open field (density 0) has no walls', () => {
    expect(generateArena(1, 0, W, H).walls).toHaveLength(0)
  })

  it('denser arenas have more buildings', () => {
    const sparse = generateArena(1, 0.3, W, H).walls.length
    const dense = generateArena(1, 1, W, H).walls.length
    expect(dense).toBeGreaterThan(sparse)
    expect(dense).toBeGreaterThan(0)
  })

  it('is deterministic per seed + density', () => {
    expect(generateArena(42, 0.6, W, H)).toEqual(generateArena(42, 0.6, W, H))
    expect(generateArena(1, 0.6, W, H)).not.toEqual(generateArena(2, 0.6, W, H))
  })

  it('keeps buildings out of the left/right spawn corridors', () => {
    const { walls } = generateArena(7, 1, W, H)
    for (const r of walls) {
      expect(r.x).toBeGreaterThanOrEqual(ARENA_MX)
      expect(r.x + r.w).toBeLessThanOrEqual(W - ARENA_MX)
    }
  })
})

describe('arena collision + avoidance', () => {
  const arena = { walls: [{ x: 100, y: 100, w: 200, h: 200 }] }

  it('insideWall detects a point within a building and misses one outside', () => {
    expect(insideWall(arena, 200, 200)).not.toBeNull()
    expect(insideWall(arena, 50, 50)).toBeNull()
  })

  it('resolveWall pushes a point out through its nearest edge', () => {
    const [nx, , ax] = resolveWall(arena.walls[0], 110, 200) // nearest the left edge (x=100)
    expect(nx).toBeLessThan(100)
    expect(ax).toBe(0)
  })

  it('addWallAvoid repels away from a nearby wall', () => {
    const out = new Float32Array(2)
    addWallAvoid(arena, 310, 200, 26, 2, out) // 10px right of the right edge (x=300)
    expect(out[0]).toBeGreaterThan(0) // pushed further right, away from the wall
  })
})
