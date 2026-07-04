import { describe, it, expect } from 'vitest'
import {
  createForestFireState, stepForestFire, EMPTY, TREE, BURNING, TREE_AGE_CAP,
  type ForestFireState,
} from './forestFire'
import type { ForestFireConfig } from './schema'

const cfg = (over: Partial<ForestFireConfig> = {}): ForestFireConfig => ({
  cellSize: 4, initialDensity: 0.4, speed: 12, growth: 0.02, lightning: 0.00002, emberLife: 6,
  ground: '#140f08', tree: '#2f9e3f', fire: '#ff5a1e', seed: 1,
  ...over,
})

const count = (st: ForestFireState, s: number) => {
  let c = 0
  for (let i = 0; i < st.state.length; i++) if (st.state[i] === s) c++
  return c
}

describe('determinism', () => {
  it('same seed → identical grid after N steps; different seed diverges', () => {
    const a = createForestFireState(cfg({ seed: 7 }), 200, 120)
    const b = createForestFireState(cfg({ seed: 7 }), 200, 120)
    const c = createForestFireState(cfg({ seed: 8 }), 200, 120)
    for (let i = 0; i < 40; i++) { stepForestFire(a); stepForestFire(b); stepForestFire(c) }
    expect([...a.state]).toEqual([...b.state])
    expect([...a.state]).not.toEqual([...c.state])
  })
})

describe('headline — fire spreads', () => {
  it('a burning cell ignites its tree neighbours and burns out to ember', () => {
    // isolate spread: no growth, no lightning
    const st = createForestFireState(cfg({ growth: 0, lightning: 0, cellSize: 10, emberLife: 6 }), 100, 100)
    const { gw, gh } = st
    // fill with trees, light the centre
    st.state.fill(TREE)
    st.age.fill(5)
    const cx = (gh >> 1) * gw + (gw >> 1)
    st.state[cx] = BURNING
    st.age[cx] = 0

    stepForestFire(st)
    // the burning cell burned out and left a fresh ember
    expect(st.state[cx]).toBe(EMPTY)
    expect(st.ember[cx]).toBe(6)
    // its 8 (Moore) tree neighbours all caught fire
    const gwn = st.gw, ghn = st.gh
    const y = ghn >> 1, x = gwn >> 1
    for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
      if (dx === 0 && dy === 0) continue
      const ni = ((y + dy + ghn) % ghn) * gwn + ((x + dx + gwn) % gwn)
      expect(st.state[ni], `neighbour ${dx},${dy}`).toBe(BURNING)
    }
  })

  it('a lit region grows then dies out (a fire front sweeps and passes)', () => {
    const st = createForestFireState(cfg({ growth: 0, lightning: 0, cellSize: 10 }), 300, 300)
    st.state.fill(TREE)
    st.age.fill(10)
    const { gw, gh } = st
    st.state[(gh >> 1) * gw + (gw >> 1)] = BURNING

    let peak = 0
    for (let i = 0; i < gw + gh + 20; i++) {
      stepForestFire(st)
      peak = Math.max(peak, count(st, BURNING))
    }
    // the front grew well beyond the single seed…
    expect(peak).toBeGreaterThan(5)
    // …then fully burned through the (finite, non-regrowing) forest
    expect(count(st, BURNING)).toBe(0)
    expect(count(st, TREE)).toBe(0)
  })
})

describe('headline — regrowth', () => {
  it('trees regrow over time from bare ground', () => {
    const st = createForestFireState(cfg({ initialDensity: 0, growth: 0.05, cellSize: 8 }), 200, 200)
    expect(count(st, TREE)).toBe(0)
    for (let i = 0; i < 50; i++) stepForestFire(st)
    expect(count(st, TREE)).toBeGreaterThan(0)
  })
})

describe('headline — self-sustaining SOC (never all-empty, never all-tree, fires recur)', () => {
  it('holds a living forest with recurring fire over a long run, no NaN', () => {
    const st = createForestFireState(cfg({ seed: 3 }), 300, 200)
    const total = st.state.length
    let sawFire = 0
    let minTree = total
    let maxTree = 0
    let allEmpty = false
    let allTree = false
    for (let i = 0; i < 1200; i++) {
      stepForestFire(st)
      const trees = count(st, TREE)
      const burning = count(st, BURNING)
      if (burning > 0) sawFire++
      minTree = Math.min(minTree, trees)
      maxTree = Math.max(maxTree, trees)
      if (trees === 0 && burning === 0) allEmpty = true
      if (trees === total) allTree = true
    }
    // fire happened on a meaningful fraction of steps (spreading, not never-burn)
    expect(sawFire).toBeGreaterThan(50)
    // the forest is genuinely alive — substantial canopy sustained
    expect(maxTree).toBeGreaterThan(total * 0.2)
    // …but never froze into a trivial absorbing state
    expect(allEmpty).toBe(false)
    expect(allTree).toBe(false)
    // no NaN leaked into age/ember banks
    for (let i = 0; i < st.state.length; i++) {
      expect(Number.isNaN(st.age[i])).toBe(false)
      expect(Number.isNaN(st.ember[i])).toBe(false)
    }
    expect(TREE_AGE_CAP).toBeGreaterThan(1)
  })
})
