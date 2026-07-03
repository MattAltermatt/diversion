import { describe, it, expect } from 'vitest'
import { createLifeState, generation, ruleMasks, AGE_CAP } from './life'
import type { GameOfLifeConfig } from './schema'

const cfg = (over: Partial<GameOfLifeConfig> = {}): GameOfLifeConfig => ({
  rule: 'Life', density: 0.32, speed: 11, cellSize: 10, trail: 10, seed: 1,
  stops: ['#0a0612', '#ff5a1e', '#ffd36b', '#fffbe8'],
  ...over,
})

describe('ruleMasks', () => {
  it('encodes Conway Life (B3/S23) as neighbour-count masks', () => {
    const { birth, survive } = ruleMasks('Life')
    expect([...birth]).toEqual([0, 0, 0, 1, 0, 0, 0, 0, 0])
    expect([...survive]).toEqual([0, 0, 1, 1, 0, 0, 0, 0, 0])
  })
  it('falls back to Life for an unknown rule', () => {
    expect([...ruleMasks('Nonsense').birth]).toEqual([...ruleMasks('Life').birth])
  })
})

describe('generation — Conway Life', () => {
  it('oscillates a blinker (horizontal → vertical)', () => {
    // 5×5 grid: 50px / 10px cells
    const st = createLifeState(cfg({ cellSize: 10 }), 50, 50)
    expect([st.gw, st.gh]).toEqual([5, 5])
    st.alive.fill(0)
    st.age.fill(0)
    st.ghost.fill(0)
    for (const i of [11, 12, 13]) { st.alive[i] = 1; st.age[i] = 1 } // horizontal at y=2
    generation(st)
    // becomes vertical through the center column: (2,1),(2,2),(2,3) → 7,12,17
    for (const i of [7, 12, 17]) expect(st.alive[i]).toBe(1)
    for (const i of [11, 13]) expect(st.alive[i]).toBe(0)
  })

  it('ages a surviving cell and ghosts a dying one', () => {
    const st = createLifeState(cfg({ trail: 10 }), 50, 50)
    st.alive.fill(0); st.age.fill(0); st.ghost.fill(0)
    for (const i of [11, 12, 13]) { st.alive[i] = 1; st.age[i] = 5 }
    generation(st)
    expect(st.age[12]).toBe(6)      // center survives → ages
    expect(st.ghost[11]).toBe(255)  // an end dies → full ghost
  })

  it('leaves no ghost at trail:0 (crisp classic Life)', () => {
    const st = createLifeState(cfg({ trail: 0 }), 50, 50)
    st.alive.fill(0); st.age.fill(0); st.ghost.fill(0)
    for (const i of [11, 12, 13]) { st.alive[i] = 1; st.age[i] = 5 }
    generation(st)
    expect(st.ghost[11]).toBe(0) // a dying cell must not flash a ghost
  })
})

describe('generation — reseed lifecycle', () => {
  it('reseeds a quiescent (all-dead) board once the quiet window elapses', () => {
    const st = createLifeState(cfg(), 50, 50)
    st.alive.fill(0) // dead board never changes → quiescent
    st.quietGens = 59
    generation(st)
    expect(st.reseeds).toBe(1)
  })
})

describe('AGE_CAP', () => {
  it('is a positive integer that caps the age ramp', () => {
    expect(Number.isInteger(AGE_CAP)).toBe(true)
    expect(AGE_CAP).toBeGreaterThan(1)
  })
})
