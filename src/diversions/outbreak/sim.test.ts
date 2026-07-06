import { describe, it, expect } from 'vitest'
import { createSim, stepSim, isResolved, CIVILIAN, FIGHTER, ZOMBIE, WORLD_W, WORLD_H, type SimConfig } from './sim'
import { buildWallGrid, insideWall } from './arena'
import { createNavGrid } from './navField'

const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({
  civilianCount: 500, fighterCount: 30, zombieCount: 40,
  zombieSpeed: 52, humanSpeed: 88, civilianSight: 110, seed: 1337, arenaDensity: 0,
  fighterRange: 128, fireCooldown: 1 / 3.2, magazine: 9, reloadTime: 2.1,
  bulletSpeed: 660, zombieFearRadius: 120, enrageRadius: 80, enrageTime: 4.5,
  panicStrength: 1.5, panicRadius: 70, ...over,
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

  it('resamples spawns out of walls now the maze fills the whole arena', () => {
    // spawnClear should keep all but a negligible fraction of agents off the walls,
    // even in a dense maze — otherwise agents start trapped and never move.
    for (const seed of [1, 2, 3, 7]) {
      const e = createSim(cfg({ arenaDensity: 0.65, seed }))
      let stuck = 0
      for (let i = 0; i < e.n; i++) if (insideWall(e.arena, e.px[i], e.py[i])) stuck++
      expect(stuck / e.n, `seed ${seed}`).toBeLessThan(0.02)
    }
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

  it('a faster zombie runs down a FLEEING civilian (separation never shields prey)', () => {
    // The regression: personal-space (7px) once exceeded bite range (5px), so a chasing
    // zombie was pushed off its target and could never catch anyone. Same-faction-only
    // separation fixes it. Zombie 90 > civilian 84, starting 24px apart in the open.
    const e = createSim(cfg({
      civilianCount: 1, fighterCount: 0, zombieCount: 1,
      zombieSpeed: 90, humanSpeed: 84, civilianSight: 120, arenaDensity: 0,
    }))
    e.px[0] = 800; e.py[0] = 450; e.px[1] = 824; e.py[1] = 450 // zombie chasing from behind
    let caught = false
    for (let i = 0; i < 600 && !caught; i++) {
      stepSim(e)
      if (e.infecting[1] || e.faction[1] === ZOMBIE) caught = true
    }
    expect(caught).toBe(true)
  })

  it('resolves to a horde win when no humans remain, after the banner hold', () => {
    const e = createSim(cfg({ civilianCount: 0, fighterCount: 0, zombieCount: 3 }))
    stepSim(e)
    expect(e.outcome).toBe('horde')
    // The win is set immediately but isResolved holds for the banner beat (#236) — the
    // sim freezes the tableau and counts the hold down before the framework reseeds.
    expect(isResolved(e)).toBe(false)
    for (let i = 0; i < 200; i++) stepSim(e) // > BANNER_SECONDS / DT
    expect(isResolved(e)).toBe(true)
  })
})

describe('flow-field navigation', () => {
  it('a zombie routes around a wall to catch an occluded fleeing civilian', () => {
    // One vertical wall (y 300..500) sits directly between the zombie and its prey, so the
    // straight line of sight is blocked and the zombie must thread the gap above or below.
    // A steering-only chaser would press into the wall face and never reach the civilian.
    const e = createSim(cfg({
      civilianCount: 1, fighterCount: 0, zombieCount: 1,
      zombieSpeed: 130, humanSpeed: 70, civilianSight: 120, arenaDensity: 0,
    }))
    const wall = { x: 780, y: 300, w: 20, h: 200 }
    e.arena = { walls: [wall], grid: buildWallGrid([wall], WORLD_W, WORLD_H) }
    e.navGrid = createNavGrid(e.arena, WORLD_W, WORLD_H)
    // index 0 = zombie, index 1 = civilian (no fighters)
    e.px[0] = 620; e.py[0] = 400; e.px[1] = 900; e.py[1] = 400
    let caught = false
    for (let i = 0; i < 1600 && !caught; i++) {
      stepSim(e)
      if (e.infecting[1] || e.faction[1] === ZOMBIE) caught = true
    }
    expect(caught).toBe(true)
  })

  it('same seed + maze → identical run after many steps (nav is deterministic)', () => {
    const a = createSim(cfg({ civilianCount: 120, arenaDensity: 1 }))
    const b = createSim(cfg({ civilianCount: 120, arenaDensity: 1 }))
    for (let i = 0; i < 200; i++) { stepSim(a); stepSim(b) }
    expect(Array.from(a.faction)).toEqual(Array.from(b.faction))
    expect(Array.from(a.px)).toEqual(Array.from(b.px))
  })
})
