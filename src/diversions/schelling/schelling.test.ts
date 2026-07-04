import { describe, it, expect } from 'vitest'
import { schellingSchema } from './schema'
import {
  createSchellingState, step, advance, buildLut, recomputeStats, EMPTY,
  type SchellingState,
} from './schelling'

const cfg = (over = {}) => schellingSchema.parse({ ...over })

const dump = (s: SchellingState) => Array.from(s.grid).join('')

describe('schelling schema', () => {
  it('parses with valid defaults', () => {
    const c = schellingSchema.parse({})
    expect(c.gridSize).toBe(80)
    expect(c.types).toBe(2)
    expect(c.tolerance).toBeGreaterThan(0)
    expect(c.tolerance).toBeLessThan(0.9)
    expect(c.moveMode).toBe('random')
    expect(c.palette.typeA).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
})

describe('schelling determinism', () => {
  it('same seed → identical initial grid', () => {
    const a = createSchellingState(cfg({ seed: 3, gridSize: 40 }), 800, 600)
    const b = createSchellingState(cfg({ seed: 3, gridSize: 40 }), 800, 600)
    expect(dump(a)).toEqual(dump(b))
  })

  it('different seed → different initial grid', () => {
    const a = createSchellingState(cfg({ seed: 1, gridSize: 40 }), 800, 600)
    const b = createSchellingState(cfg({ seed: 2, gridSize: 40 }), 800, 600)
    expect(dump(a)).not.toEqual(dump(b))
  })

  it('same seed → identical evolution over many rounds', () => {
    const a = createSchellingState(cfg({ seed: 5, gridSize: 48 }), 800, 600)
    const b = createSchellingState(cfg({ seed: 5, gridSize: 48 }), 800, 600)
    for (let i = 0; i < 40; i++) { step(a); step(b) }
    expect(dump(a)).toEqual(dump(b))
  })
})

describe('schelling invariants', () => {
  it('conserves the composition (empties and per-type counts) across rounds', () => {
    const s = createSchellingState(cfg({ seed: 9, gridSize: 48, types: 3 }), 800, 600)
    const count = (st: SchellingState) => {
      const c = [0, 0, 0, 0] // empty, A, B, C
      for (let i = 0; i < st.grid.length; i++) c[st.grid[i] === EMPTY ? 0 : st.grid[i] + 1]++
      return c.join(',')
    }
    const before = count(s)
    for (let i = 0; i < 60; i++) step(s)
    expect(count(s)).toBe(before)
  })

  it('empty index stays consistent with the grid', () => {
    const s = createSchellingState(cfg({ seed: 4, gridSize: 40 }), 800, 600)
    for (let i = 0; i < 30; i++) step(s)
    let empties = 0
    for (let i = 0; i < s.grid.length; i++) if (s.grid[i] === EMPTY) empties++
    expect(s.emptyCount).toBe(empties)
    // every listed empty cell really is empty
    for (let e = 0; e < s.emptyCount; e++) expect(s.grid[s.empties[e]]).toBe(EMPTY)
  })
})

describe('schelling headline: segregation emerges from mild preference', () => {
  it('segregation rises well above the random baseline and unhappiness falls (2 types)', () => {
    const s = createSchellingState(cfg({ seed: 11, gridSize: 64, types: 2, tolerance: 0.35 }), 800, 600)
    recomputeStats(s)
    const seg0 = s.segregation
    const unhappy0 = s.unhappy
    // random 2-type baseline sits near 0.5
    expect(seg0).toBeGreaterThan(0.4)
    expect(seg0).toBeLessThan(0.62)
    expect(unhappy0).toBeGreaterThan(50)

    for (let i = 0; i < 60; i++) step(s)

    expect(Number.isNaN(s.segregation)).toBe(false)
    // mild 35% preference still crystallises into strongly segregated blocks
    // (settles near ~0.77 same-type — well above the 0.5 random baseline)
    expect(s.segregation).toBeGreaterThan(0.7)
    expect(s.segregation - seg0).toBeGreaterThan(0.2)
    // and almost everyone ends up happy
    expect(s.unhappy).toBeLessThan(unhappy0)
    expect(s.unhappy).toBeLessThan(20)
  })

  it('also segregates with 3 types and the nearest move mode', () => {
    const s = createSchellingState(cfg({ seed: 21, gridSize: 60, types: 3, tolerance: 0.35, moveMode: 'nearest' }), 800, 600)
    recomputeStats(s)
    const seg0 = s.segregation
    expect(seg0).toBeLessThan(0.5) // ~1/3 baseline-ish
    for (let i = 0; i < 80; i++) step(s)
    expect(Number.isNaN(s.segregation)).toBe(false)
    // 3 types settle near ~0.70 same-type — a big rise from the ~0.33 baseline
    expect(s.segregation).toBeGreaterThan(0.62)
    expect(s.segregation - seg0).toBeGreaterThan(0.28)
  })
})

describe('schelling loop', () => {
  it('enters a hold phase once settled, then reshuffles back to noise', () => {
    const s = createSchellingState(cfg({ seed: 11, gridSize: 48, types: 2, tolerance: 0.35, speed: 30, holdSeconds: 1 }), 800, 600)
    // Run enough sim time to settle.
    for (let i = 0; i < 400 && s.phase === 'sorting'; i++) advance(s, 100)
    expect(s.phase).toBe('holding')
    const settledSeg = s.segregation
    // Hold expires → reshuffle back to a noisy (low-segregation) mix.
    advance(s, 1100)
    expect(s.phase).toBe('sorting')
    expect(s.segregation).toBeLessThan(settledSeg)
  })
})

describe('schelling LUT', () => {
  it('has empty + 3 type rgb slots', () => {
    const lut = buildLut(cfg())
    expect(lut.length).toBe(4 * 3)
    // background differs from type A
    expect([lut[0], lut[1], lut[2]]).not.toEqual([lut[3], lut[4], lut[5]])
  })
})
