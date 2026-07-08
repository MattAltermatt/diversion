import { describe, it, expect } from 'vitest'
import { createCloudLifeState, generation, cellValue } from './life'
import type { CloudLifeConfig } from './schema'

const cfg = (over: Partial<CloudLifeConfig> = {}): CloudLifeConfig => ({
  maxAge: 5, initialDensity: 0.3, speed: 22, cellSize: 10,
  palette: ['#eef7ff', '#a9d4f5', '#6f96d8', '#3c4a8f'], background: '#05070d', seed: 1,
  ...over,
})

describe('cellValue', () => {
  it('is 0 for a dead cell', () => {
    expect(cellValue(0, 0, 5)).toBe(0)
  })
  it('is 1 for a live cell at or below max age', () => {
    expect(cellValue(1, 1, 5)).toBe(1)
    expect(cellValue(1, 5, 5)).toBe(1)
  })
  it('is 3 (the "explode" weight) for a live cell aged past max age', () => {
    expect(cellValue(1, 6, 5)).toBe(3)
  })
})

describe('createCloudLifeState — determinism', () => {
  it('same seed → identical initial grid', () => {
    const a = createCloudLifeState(cfg({ seed: 42 }), 100, 100)
    const b = createCloudLifeState(cfg({ seed: 42 }), 100, 100)
    expect([...a.alive]).toEqual([...b.alive])
    expect([...a.age]).toEqual([...b.age])
  })
  it('different seeds → different grids', () => {
    const a = createCloudLifeState(cfg({ seed: 1 }), 100, 100)
    const b = createCloudLifeState(cfg({ seed: 2 }), 100, 100)
    expect([...a.alive]).not.toEqual([...b.alive])
  })
})

describe('generation — Conway Life baseline (young cells, no explode)', () => {
  it('oscillates a blinker (horizontal → vertical)', () => {
    // 5×5 grid: 50px / 10px cells
    const st = createCloudLifeState(cfg({ cellSize: 10 }), 50, 50)
    expect([st.gw, st.gh]).toEqual([5, 5])
    st.alive.fill(0)
    st.age.fill(0)
    for (const i of [11, 12, 13]) { st.alive[i] = 1; st.age[i] = 1 } // horizontal at y=2
    generation(st)
    // becomes vertical through the center column: (2,1),(2,2),(2,3) → 7,12,17
    for (const i of [7, 12, 17]) expect(st.alive[i]).toBe(1)
    for (const i of [11, 13]) expect(st.alive[i]).toBe(0)
  })

  it('ages a surviving cell by 1', () => {
    const st = createCloudLifeState(cfg(), 50, 50)
    st.alive.fill(0); st.age.fill(0)
    for (const i of [11, 12, 13]) { st.alive[i] = 1; st.age[i] = 3 }
    generation(st)
    expect(st.age[12]).toBe(4) // center survives (2 neighbours) → ages by 1
  })
})

describe('generation — age-weighted explode rule', () => {
  it('a single aged-out neighbour alone triggers a birth (counts as 3)', () => {
    const st = createCloudLifeState(cfg({ maxAge: 5 }), 50, 50)
    st.alive.fill(0); st.age.fill(0)
    // one live neighbour of a dead cell, aged well past max_age
    st.alive[11] = 1; st.age[11] = 20 // cell_value = 3 (dead: 0, but alive+aged → 3)
    generation(st)
    expect(st.alive[12]).toBe(1) // born: sum === 3 from the single aged-out neighbour
    expect(st.age[12]).toBe(1)
  })

  it('the same single YOUNG neighbour does NOT trigger a birth', () => {
    const st = createCloudLifeState(cfg({ maxAge: 5 }), 50, 50)
    st.alive.fill(0); st.age.fill(0)
    st.alive[11] = 1; st.age[11] = 2 // cell_value = 1, not enough alone
    generation(st)
    expect(st.alive[12]).toBe(0)
  })

  it('an aged-out neighbour can overpopulate and kill an otherwise-surviving cell', () => {
    const st = createCloudLifeState(cfg({ maxAge: 5 }), 50, 50)
    st.alive.fill(0); st.age.fill(0)
    // center cell (12) alive with 2 young neighbours (would survive under
    // classic B3/S23) PLUS one aged-out neighbour weighing 3 → sum = 1+1+3 = 5.
    st.alive[12] = 1; st.age[12] = 2
    st.alive[7] = 1; st.age[7] = 2   // young, weight 1
    st.alive[13] = 1; st.age[13] = 2 // young, weight 1
    st.alive[17] = 1; st.age[17] = 20 // aged-out, weight 3
    generation(st)
    expect(st.alive[12]).toBe(0) // sum 5 is neither 2 nor 3 → dies (overpopulation)
  })
})

describe('generation — reseed lifecycle', () => {
  it('reseeds a quiescent (all-dead) board once the quiet window elapses', () => {
    const st = createCloudLifeState(cfg(), 50, 50)
    st.alive.fill(0) // dead board never changes → quiescent
    st.quietGens = 89
    generation(st)
    expect(st.reseeds).toBe(1)
  })
})
