import { describe, it, expect } from 'vitest'
import { createSim, stepSim, isResolved, CIVILIAN, FIGHTER, ZOMBIE, type SimConfig } from './sim'

const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({
  civilianCount: 500, fighterCount: 30, zombieCount: 40,
  zombieSpeed: 52, humanSpeed: 88, seed: 1337,
  fighterRange: 128, fireCooldown: 1 / 3.2, magazine: 9, reloadTime: 2.1,
  bulletSpeed: 660, zombieFearRadius: 120, enrageRadius: 80, enrageTime: 4.5, ...over,
})

describe('createSim / determinism', () => {
  it('same seed + config → identical initial state', () => {
    const a = createSim(cfg()), b = createSim(cfg())
    expect(Array.from(a.px)).toEqual(Array.from(b.px))
    expect(Array.from(a.py)).toEqual(Array.from(b.py))
    expect(Array.from(a.faction)).toEqual(Array.from(b.faction))
  })

  it('different seed → different layout', () => {
    const a = createSim(cfg({ seed: 1 })), b = createSim(cfg({ seed: 2 }))
    expect(Array.from(a.px)).not.toEqual(Array.from(b.px))
  })

  it('same seed → identical run after many steps', () => {
    const a = createSim(cfg({ civilianCount: 120 })), b = createSim(cfg({ civilianCount: 120 }))
    for (let i = 0; i < 200; i++) { stepSim(a); stepSim(b) }
    expect(Array.from(a.faction)).toEqual(Array.from(b.faction))
    expect(Array.from(a.px)).toEqual(Array.from(b.px))
  })

  it('spawns the requested faction counts', () => {
    const e = createSim(cfg({ civilianCount: 10, fighterCount: 3, zombieCount: 5 }))
    expect(e.n).toBe(18)
    expect(e.civAlive).toBe(10)
    expect(e.fighterAlive).toBe(3)
    expect(e.zombieAlive).toBe(5)
  })
})

describe('conversion cycle', () => {
  it('a zombie bites a co-located human, who turns after the infection delay', () => {
    const e = createSim(cfg({ civilianCount: 1, fighterCount: 0, zombieCount: 1 }))
    // index 0 = zombie, index 1 = civilian (fighters spawn first, but there are none)
    expect(e.faction[0]).toBe(ZOMBIE)
    expect(e.faction[1]).toBe(CIVILIAN)
    e.px[0] = 800; e.py[0] = 450; e.px[1] = 800; e.py[1] = 450
    stepSim(e)
    expect(e.infecting[1]).toBe(1) // bitten immediately
    expect(e.faction[1]).toBe(CIVILIAN) // but not yet turned
    for (let i = 0; i < 80; i++) stepSim(e) // > INFECT_DELAY / DT
    expect(e.faction[1]).toBe(ZOMBIE)
    expect(e.zombieAlive).toBe(2)
  })

  it('a fighter recruits a nearby uninfected civilian', () => {
    const e = createSim(cfg({ civilianCount: 1, fighterCount: 1, zombieCount: 0 }))
    expect(e.faction[0]).toBe(FIGHTER)
    expect(e.faction[1]).toBe(CIVILIAN)
    e.px[0] = 800; e.py[0] = 450; e.px[1] = 810; e.py[1] = 450 // within RECRUIT_R
    stepSim(e)
    expect(e.faction[1]).toBe(FIGHTER)
    expect(e.fighterAlive).toBe(2)
  })

  it('resolves to a horde win when no humans remain', () => {
    const e = createSim(cfg({ civilianCount: 0, fighterCount: 0, zombieCount: 3 }))
    stepSim(e)
    expect(e.outcome).toBe('horde')
    expect(isResolved(e)).toBe(true)
  })
})
