import { describe, it, expect } from 'vitest'
import { tensorDims, simGrid, stepSeed, GRID_MIN, GRID_MAX } from './gl'

describe('neural-ca tensorDims (channel tiling)', () => {
  it('tiles the 12-channel state into a 2×2 grid of depth4=3 groups', () => {
    const d = tensorDims(96, 96, 12)
    expect(d.depth4).toBe(3) // ceil(12/4)
    expect(d.gridW).toBe(2) // ceil(sqrt(3))
    expect(d.gridH).toBe(2) // ceil(3/2)
    expect(d.texW).toBe(192)
    expect(d.texH).toBe(192)
  })

  it('tiles the 48-channel perception into depth4=12 (4×3)', () => {
    const d = tensorDims(96, 96, 48)
    expect(d.depth4).toBe(12)
    expect(d.gridW).toBe(4) // ceil(sqrt(12))
    expect(d.gridH).toBe(3) // ceil(12/4)
    expect(d.texW).toBe(96 * 4)
    expect(d.texH).toBe(96 * 3)
  })

  it('tiles the 96-channel hidden layer into depth4=24 (5×5)', () => {
    const d = tensorDims(96, 96, 96)
    expect(d.depth4).toBe(24)
    expect(d.gridW).toBe(5) // ceil(sqrt(24))
    expect(d.gridH).toBe(5) // ceil(24/5) -> 5 (holds 25 ≥ 24)
    expect(d.gridW * d.gridH).toBeGreaterThanOrEqual(d.depth4)
  })

  it('always allocates enough tiles to hold every channel group', () => {
    for (const depth of [1, 4, 5, 12, 16, 48, 96, 100]) {
      const d = tensorDims(32, 32, depth)
      expect(d.gridW * d.gridH).toBeGreaterThanOrEqual(d.depth4)
    }
  })
})

describe('neural-ca stepSeed (deterministic per-step seed — share-link keystone)', () => {
  it('is a pure function of (seed, step)', () => {
    expect(stepSeed(42, 7)).toBe(stepSeed(42, 7))
    expect(stepSeed(123, 0)).toBe(stepSeed(123, 0))
  })

  it('produces a reproducible sequence for the same seed but a different one for another seed', () => {
    const seq = (s: number) => Array.from({ length: 16 }, (_, i) => stepSeed(s, i))
    expect(seq(42)).toEqual(seq(42)) // same seed → identical run (restarts identically)
    expect(seq(42)).not.toEqual(seq(43)) // different seed → different genesis
  })

  it('varies well across steps for a fixed seed (not constant)', () => {
    const seq = Array.from({ length: 24 }, (_, i) => stepSeed(42, i))
    expect(new Set(seq).size).toBeGreaterThan(18)
  })

  it('stays in [0, 1000) — the range the fire-rate hash was tuned for', () => {
    for (let i = 0; i < 200; i++) {
      const s = stepSeed(i * 2654435761, i)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThan(1000)
    }
  })
})

describe('neural-ca simGrid', () => {
  it('scales the grid with the scale control, clamped + even', () => {
    expect(simGrid(1)).toBe(128)
    expect(simGrid(0.001)).toBe(GRID_MIN)
    expect(simGrid(100)).toBe(GRID_MAX)
    for (const s of [0.5, 0.75, 1, 1.5, 2]) {
      const g = simGrid(s)
      expect(g % 2).toBe(0)
      expect(g).toBeGreaterThanOrEqual(GRID_MIN)
      expect(g).toBeLessThanOrEqual(GRID_MAX)
    }
  })
})
