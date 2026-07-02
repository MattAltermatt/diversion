import { describe, it, expect } from 'vitest'
import {
  createDemonState, stepDemon, updateDemonState,
  reseedDemon, shouldReseedDemon, type DemonState,
} from './demon'
import { demonSchema, type DemonConfig } from './schema'

const base: DemonConfig = {
  field: 'square', colors: 6, dominanceReach: 1, threshold: 2, speed: 8, cellSize: 10,
  color: { hueStart: 0, hueSpan: 360, saturation: 70, lightness: 55 },
  background: '#05060a', seed: 42,
}

function gridHash(st: DemonState): number {
  let hsh = 2166136261
  for (let i = 0; i < st.cur.length; i++) { hsh ^= st.cur[i]; hsh = Math.imul(hsh, 16777619) }
  return hsh >>> 0
}

describe('demon CA', () => {
  it('seeds a full grid and an N-length LUT', () => {
    const st = createDemonState(base, 200, 200)
    expect(st.cur.length).toBe(st.tess.cellCount)
    expect(st.lut).toHaveLength(6)
  })
  it('is deterministic for a fixed seed across K steps', () => {
    const a = createDemonState(base, 200, 200)
    const b = createDemonState(base, 200, 200)
    for (let i = 0; i < 20; i++) { stepDemon(a); stepDemon(b) }
    expect(gridHash(a)).toBe(gridHash(b))
  })
  it('k=1 only ever advances a cell to its immediate successor', () => {
    const st = createDemonState({ ...base, dominanceReach: 1 }, 120, 120)
    const before = Uint8Array.from(st.cur)
    stepDemon(st)
    let allOk = true
    for (let i = 0; i < st.cur.length; i++) {
      const c = before[i], nx = st.cur[i]
      if (!(nx === c || nx === (c + 1) % st.n)) allOk = false
    }
    expect(allOk).toBe(true)
  })
  it('clamps dominanceReach to floor((N-1)/2) and threshold to field degree', () => {
    const st = createDemonState({ ...base, field: 'triangle', colors: 6, dominanceReach: 7, threshold: 6 }, 200, 200)
    expect(st.kEff).toBe(2)  // floor((6-1)/2)
    expect(st.tEff).toBe(3)  // triangle degree
  })
  it('updateDemonState applies speed live (true) but rebuilds on field change (false)', () => {
    const st = createDemonState(base, 200, 200)
    expect(updateDemonState(st, { ...base, speed: 20 }, { width: 200, height: 200 })).toBe(true)
    expect(st.cfg.speed).toBe(20)
    expect(updateDemonState(st, { ...base, field: 'hexagon' }, { width: 200, height: 200 })).toBe(false)
  })
})

describe('reseed lifecycle (#194)', () => {
  // Drive the lifecycle exactly as `frame` does: step, and reseed when quiescent.
  const runWithReseed = (cfg: DemonConfig, w: number, h: number, gens: number) => {
    const st = createDemonState(cfg, w, h)
    let reseeds = 0, sawFrozen = false
    for (let g = 0; g < gens; g++) {
      stepDemon(st)
      if (st.changed.length === 0) sawFrozen = true
      if (shouldReseedDemon(st)) { reseedDemon(st); reseeds++ }
    }
    return { reseeds, sawFrozen }
  }

  it('brings a frozen config back to life instead of leaving a permanent dead frame', () => {
    // hex/12/T=2 reliably reaches an absorbing state within ~20 gens; the lifecycle
    // must detect it and reseed so the screen never stays dead.
    const cfg = demonSchema.parse({ field: 'hexagon', colors: 12, dominanceReach: 1, threshold: 2, seed: 42 })
    const { reseeds, sawFrozen } = runWithReseed(cfg, 1200, 900, 400)
    expect(sawFrozen).toBe(true)          // it did freeze…
    expect(reseeds).toBeGreaterThan(0)    // …and came back
  })

  it('never reseeds a lively T=1 config over a long run', () => {
    const cfg = demonSchema.parse({ field: 'hexagon', colors: 8, dominanceReach: 1, threshold: 1, seed: 42 })
    const { reseeds } = runWithReseed(cfg, 1200, 900, 500)
    expect(reseeds).toBe(0)
  })

  it('reseedDemon re-noises with a folded seed and resets the lifecycle counters', () => {
    const cfg = demonSchema.parse({ threshold: 2, seed: 42 })
    const st = createDemonState(cfg, 400, 300)
    for (let g = 0; g < 5; g++) stepDemon(st)
    const before = Array.from(st.cur)
    reseedDemon(st)
    expect(st.step).toBe(0)
    expect(st.quietSteps).toBe(0)
    expect(st.needsClear).toBe(true)
    expect(Array.from(st.cur)).not.toEqual(before) // a different world
  })
})
