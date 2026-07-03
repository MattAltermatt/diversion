import { describe, it, expect } from 'vitest'
import { termiteSortingSchema } from './schema'
import { createTermiteState, step, advance, countPiles } from './termites'

const cfg = (over = {}) => termiteSortingSchema.parse({ ...over })

describe('termite-sorting determinism', () => {
  it('same seed → identical initial scatter + termites', () => {
    const a = createTermiteState(cfg({ seed: 4 }), 800, 600)
    const b = createTermiteState(cfg({ seed: 4 }), 800, 600)
    expect(Array.from(a.chips)).toEqual(Array.from(b.chips))
    const dump = (s: typeof a) => s.termites.map((t) => `${t.col},${t.row},${t.dir}`).join('|')
    expect(dump(a)).toEqual(dump(b))
  })

  it('different seed → different scatter', () => {
    const a = createTermiteState(cfg({ seed: 1 }), 800, 600)
    const b = createTermiteState(cfg({ seed: 2 }), 800, 600)
    expect(Array.from(a.chips)).not.toEqual(Array.from(b.chips))
  })

  it('scatters ≈ chipDensity of the grid', () => {
    const s = createTermiteState(cfg({ seed: 3, chipDensity: 0.25, gridResolution: 64 }), 800, 600)
    const chips = s.chips.reduce((a, v) => a + (v !== -1 ? 1 : 0), 0)
    expect(chips).toBe(Math.floor(0.25 * 64 * 64))
  })
})

describe('sorting dynamics', () => {
  it('conserves chips: none created or destroyed (accounting for carried)', () => {
    const s = createTermiteState(cfg({ seed: 5, gridResolution: 64, chipDensity: 0.25, termiteCount: 200 }), 800, 600)
    const initial = s.chips.reduce((a, v) => a + (v !== -1 ? 1 : 0), 0)
    for (let t = 0; t < 400; t++) step(s)
    const onFloor = s.chips.reduce((a, v) => a + (v !== -1 ? 1 : 0), 0)
    const carried = s.termites.reduce((a, tm) => a + (tm.carry !== -1 ? 1 : 0), 0)
    expect(onFloor + carried).toBe(initial)
  })

  it('consolidates: pile count falls well below the initial scatter', () => {
    const s = createTermiteState(cfg({ seed: 6, gridResolution: 80, chipDensity: 0.22, colorCount: 1, termiteCount: 500, wanderStrength: 0.2 }), 800, 600)
    const start = countPiles(s.chips, s.n)
    for (let t = 0; t < 4000; t++) step(s)
    const end = countPiles(s.chips, s.n)
    expect(end).toBeLessThan(start * 0.5)
  })

  it('countPiles: one contiguous block is a single pile', () => {
    const n = 8
    const chips = new Int8Array(n * n).fill(-1)
    // a 3×3 block in the corner
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) chips[r * n + c] = 0
    expect(countPiles(chips, n)).toBe(1)
    // add a disconnected single cell → two piles
    chips[5 * n + 5] = 0
    expect(countPiles(chips, n)).toBe(2)
  })

  it('advance fires whole steps from dt', () => {
    const s = createTermiteState(cfg({ seed: 7, simSpeed: 20 }), 800, 600)
    advance(s, 260)
    expect(s.tick).toBeGreaterThanOrEqual(5)
    expect(s.tick).toBeLessThanOrEqual(6)
  })
})
