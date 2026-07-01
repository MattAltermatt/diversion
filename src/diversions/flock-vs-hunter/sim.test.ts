import { describe, it, expect } from 'vitest'
import { createSim, stepSim, DEFAULT_SIM_CONFIG, hashState, type SimConfig } from './sim'

const cfg: SimConfig = { ...DEFAULT_SIM_CONFIG, boidCount: 120, predatorCount: 3, seed: 42 }

describe('sim (movement + catch)', () => {
  it('is deterministic: same seed+config → identical state after 600 ticks', () => {
    const a = createSim(cfg); for (let i = 0; i < 600; i++) stepSim(a)
    const b = createSim(cfg); for (let i = 0; i < 600; i++) stepSim(b)
    expect(hashState(a)).toBe(hashState(b))
  })

  it('advances tickCount and keeps positions inside the wrapped world', () => {
    const s = createSim(cfg)
    for (let i = 0; i < 300; i++) stepSim(s)
    expect(s.tickCount).toBe(300)
    for (let i = 0; i < s.n; i++) {
      expect(s.px[i]).toBeGreaterThanOrEqual(0)
      expect(s.px[i]).toBeLessThan(1600)
      expect(s.py[i]).toBeGreaterThanOrEqual(0)
      expect(s.py[i]).toBeLessThan(900)
    }
  })

  it('records at least one catch over a long run with dense prey', () => {
    const s = createSim({ ...cfg, boidCount: 200, predatorCount: 5 })
    let kills = 0
    for (let i = 0; i < 4000; i++) { stepSim(s); kills = s.totalKills }
    expect(kills).toBeGreaterThan(0)
  })
})

import { createSim as mk, stepSim as tick, DEFAULT_SIM_CONFIG as D, hashState as hs } from './sim'

describe('sim (evolution)', () => {
  const cfg = { ...D, boidCount: 120, predatorCount: 3, seed: 7, roundLength: 2 } // 2s = 120 ticks

  it('turns the generation over at the round boundary and refills the flock', () => {
    const s = mk(cfg)
    for (let i = 0; i < 120; i++) tick(s) // exactly one full round → the boundary
    expect(s.generation).toBe(2)
    let aliveCount = 0
    for (let i = 0; i < s.n; i++) aliveCount += s.alive[i]
    expect(aliveCount).toBe(s.n) // flock refilled to full at the round boundary
  })

  it('stays deterministic through several generations (breeding + immigration)', () => {
    const a = mk(cfg); for (let i = 0; i < 800; i++) tick(a)
    const b = mk(cfg); for (let i = 0; i < 800; i++) tick(b)
    expect(hs(a)).toBe(hs(b))
    expect(a.gen1Elite).toBeDefined()
    expect(a.gen3Elite).toBeDefined()
    expect(a.gen3Elite).toEqual(b.gen3Elite) // post-setup rng stream reproduces
  })
})
