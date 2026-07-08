import { describe, it, expect } from 'vitest'
import {
  createSandState, stepSand, paintAt, EMPTY, SAND, WATER, STONE, PLANT, FIRE,
} from './sim'
import type { FallingSandConfig } from './schema'

const cfg = (over: Partial<FallingSandConfig> = {}): FallingSandConfig => ({
  cellSize: 10, simSpeed: 60, emitterCount: 2, emitRate: 24,
  elements: { emitSand: true, emitWater: true, emitFire: true, emitPlant: true },
  background: '#07080c',
  colors: { sand: '#d9a054', water: '#2e78c9', fire: '#ff7a1e', stone: '#5a5f66', plant: '#3f9e4a' },
  seed: 1,
  ...over,
})

// Hand-placed-cell mechanics tests isolate ONE rule at a time, so they turn
// emitters off — otherwise the autonomous spouts (which are exercised on their
// own below) would keep dropping unrelated material into the same grid.
const noEmit = (over: Partial<FallingSandConfig> = {}) => cfg({ emitterCount: 0, emitRate: 0, ...over })

describe('createSandState — determinism', () => {
  it('same seed produces an identical initial grid and emitter roster', () => {
    const a = createSandState(cfg({ seed: 7 }), 100, 100)
    const b = createSandState(cfg({ seed: 7 }), 100, 100)
    expect([...a.grid]).toEqual([...b.grid])
    expect(a.emitters).toEqual(b.emitters)
  })

  it('same seed replays an identical run for many steps', () => {
    const a = createSandState(cfg({ seed: 3 }), 120, 120)
    const b = createSandState(cfg({ seed: 3 }), 120, 120)
    for (let i = 0; i < 50; i++) { stepSand(a, 1 / 60); stepSand(b, 1 / 60) }
    expect([...a.grid]).toEqual([...b.grid])
  })

  it('different seeds diverge', () => {
    const a = createSandState(cfg({ seed: 1 }), 100, 100)
    const b = createSandState(cfg({ seed: 2 }), 100, 100)
    expect(a.emitters.map((e) => e.driftPhase)).not.toEqual(b.emitters.map((e) => e.driftPhase))
  })
})

describe('sand — falls and piles', () => {
  it('falls straight down through open space', () => {
    const st = createSandState(noEmit(), 50, 200) // gw=5, gh=20
    st.grid.fill(EMPTY)
    const gx = 2
    st.grid[gx] = SAND // top row, no obstruction below
    for (let i = 0; i < 10; i++) stepSand(st, 1 / 60)
    const idx = 10 * st.gw + gx
    expect(st.grid[idx]).toBe(SAND)
  })

  it('piles across more than one column at an angle of repose (does not stack in a single line)', () => {
    const st = createSandState(noEmit(), 100, 100) // gw=gh=10
    st.grid.fill(EMPTY)
    const cx = Math.floor(st.gw / 2)
    for (let y = 0; y < 6; y++) st.grid[y * st.gw + cx] = SAND
    for (let i = 0; i < 20; i++) stepSand(st, 1 / 60)
    const cols = new Set<number>()
    for (let x = 0; x < st.gw; x++) if (st.grid[(st.gh - 1) * st.gw + x] === SAND) cols.add(x)
    expect(cols.size).toBeGreaterThan(1)
  })
})

describe('water — flows and spreads', () => {
  it('a poured column spreads sideways across the floor (not a single puddle point)', () => {
    const st = createSandState(noEmit(), 200, 100) // gw=20, gh=10
    st.grid.fill(EMPTY)
    const cx = Math.floor(st.gw / 2)
    for (let y = 0; y < 5; y++) st.grid[y * st.gw + cx] = WATER
    for (let i = 0; i < 8; i++) stepSand(st, 1 / 60)
    const cols = new Set<number>()
    for (let x = 0; x < st.gw; x++) if (st.grid[(st.gh - 1) * st.gw + x] === WATER) cols.add(x)
    expect(cols.size).toBeGreaterThan(1)
  })
})

describe('sand sinks through water', () => {
  it('a sand grain above water ends up below it', () => {
    const st = createSandState(noEmit(), 30, 30) // gw=3, gh=3
    st.grid.fill(EMPTY)
    st.grid[1] = SAND // top row
    st.grid[st.gw + 1] = WATER // middle row, same column
    for (let i = 0; i < 10; i++) stepSand(st, 1 / 60)
    const col = 1
    expect(st.grid[(st.gh - 1) * st.gw + col]).toBe(SAND)
  })
})

describe('a cell never moves twice in one tick', () => {
  it('a falling grain advances at most one row per step', () => {
    const st = createSandState(noEmit(), 30, 300) // gw=3, gh=30
    st.grid.fill(EMPTY)
    st.grid[1] = SAND // top row, middle column
    stepSand(st, 1 / 60)
    let foundRow = -1
    for (let y = 0; y < st.gh; y++) {
      for (let x = 0; x < st.gw; x++) if (st.grid[y * st.gw + x] === SAND) foundRow = y
    }
    expect(foundRow).toBeLessThanOrEqual(1)
  })

  it('a rising fire cell advances at most one row per step', () => {
    const st = createSandState(noEmit(), 30, 300) // gw=3, gh=30
    st.grid.fill(EMPTY)
    const startRow = 15
    const i = startRow * st.gw + 1
    st.grid[i] = FIRE
    st.fireLife[i] = 100 // long life so it doesn't extinguish mid-test
    stepSand(st, 1 / 60)
    let foundRow = -1
    for (let y = 0; y < st.gh; y++) {
      for (let x = 0; x < st.gw; x++) if (st.grid[y * st.gw + x] === FIRE) foundRow = y
    }
    expect(foundRow).toBeGreaterThanOrEqual(startRow - 1)
  })
})

describe('fire — rises, decays, and ignites plant', () => {
  it('climbs and ignites a plant fuse directly above it', () => {
    const st = createSandState(noEmit(), 100, 100)
    st.grid.fill(EMPTY)
    const cx = Math.floor(st.gw / 2), cy = Math.floor(st.gh / 2)
    const fi = cy * st.gw + cx
    const above = fi - st.gw
    st.grid[fi] = FIRE
    st.fireLife[fi] = 40
    st.grid[above] = PLANT // blocks the rise path, so fire stays adjacent every tick
    let ignited = false
    for (let i = 0; i < 40 && !ignited; i++) {
      stepSand(st, 1 / 60)
      if (st.grid[above] === FIRE) ignited = true
    }
    expect(ignited).toBe(true)
  })

  it('extinguishes immediately when touching water', () => {
    const st = createSandState(noEmit(), 100, 100)
    st.grid.fill(EMPTY)
    const cx = Math.floor(st.gw / 2), cy = Math.floor(st.gh / 2)
    const fi = cy * st.gw + cx
    st.grid[fi] = FIRE
    st.fireLife[fi] = 40
    st.grid[fi + 1] = WATER
    stepSand(st, 1 / 60)
    expect(st.grid[fi]).toBe(EMPTY)
  })

  it('burns out to empty once its life reaches zero', () => {
    const st = createSandState(noEmit(), 100, 100)
    st.grid.fill(EMPTY)
    const i = 5 * st.gw + 5
    st.grid[i] = FIRE
    st.fireLife[i] = 1
    stepSand(st, 1 / 60)
    expect(st.grid[i]).not.toBe(FIRE)
  })
})

describe('stone', () => {
  it('never moves', () => {
    const st = createSandState(noEmit(), 50, 50)
    st.grid.fill(EMPTY)
    const i = st.gw + 1
    st.grid[i] = STONE
    for (let k = 0; k < 20; k++) stepSand(st, 1 / 60)
    expect(st.grid[i]).toBe(STONE)
  })
})

describe('autonomy — emitters keep pouring', () => {
  it('a run starting from an empty chamber has material after enough steps', () => {
    const st = createSandState(cfg({ emitRate: 40 }), 200, 200)
    st.grid.fill(EMPTY)
    for (let i = 0; i < 120; i++) stepSand(st, 1 / 60)
    let filled = 0
    for (let i = 0; i < st.grid.length; i++) if (st.grid[i] !== EMPTY) filled++
    expect(filled).toBeGreaterThan(0)
  })

  it('drain keeps a long-running chamber from fully filling', () => {
    const st = createSandState(cfg({ emitRate: 80, emitterCount: 4 }), 150, 150)
    st.grid.fill(EMPTY)
    for (let i = 0; i < 600; i++) stepSand(st, 1 / 60)
    let filled = 0
    for (let i = 0; i < st.grid.length; i++) if (st.grid[i] !== EMPTY) filled++
    expect(filled).toBeLessThan(st.grid.length)
  })
})

describe('pointer painting', () => {
  it('paintAt drops a small blob of the given element', () => {
    const st = createSandState(cfg(), 100, 100)
    st.grid.fill(EMPTY)
    paintAt(st, 50, 50, SAND, 2)
    let painted = 0
    for (let i = 0; i < st.grid.length; i++) if (st.grid[i] === SAND) painted++
    expect(painted).toBeGreaterThan(0)
  })

  it('does not overwrite stone', () => {
    const st = createSandState(cfg(), 100, 100)
    st.grid.fill(EMPTY)
    const cx = Math.floor(50 / st.cell), cy = Math.floor(50 / st.cell)
    st.grid[cy * st.gw + cx] = STONE
    paintAt(st, 50, 50, SAND, 2)
    expect(st.grid[cy * st.gw + cx]).toBe(STONE)
  })
})
