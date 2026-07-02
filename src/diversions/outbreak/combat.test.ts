import { describe, it, expect } from 'vitest'
import { createSim, stepSim, ZOMBIE, WORLD_W, WORLD_H, type SimConfig } from './sim'
import { buildWallGrid } from './arena'
import { createNavGrid } from './navField'

const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({
  civilianCount: 0, fighterCount: 1, zombieCount: 1,
  zombieSpeed: 52, humanSpeed: 88, civilianSight: 110, seed: 7, arenaDensity: 0,
  fighterRange: 128, fireCooldown: 1 / 3.2, magazine: 9, reloadTime: 2.1,
  bulletSpeed: 660, zombieFearRadius: 120, enrageRadius: 80, enrageTime: 4.5, ...over,
})

/** Cluster the zombies right in front of the lone fighter (indices: 0 = fighter,
 *  1.. = zombies), all inside firing range. */
function frontline(e: ReturnType<typeof createSim>, zombies: number): void {
  e.px[0] = 800; e.py[0] = 450
  for (let z = 1; z <= zombies; z++) {
    e.px[z] = 840 + (z % 4) * 8
    e.py[z] = 430 + ((z * 7) % 40)
  }
}

describe('combat', () => {
  it('a fighter guns down a lone zombie → humans win', () => {
    const e = createSim(cfg({ zombieCount: 1 }))
    frontline(e, 1)
    let resolved = false
    for (let i = 0; i < 600 && !resolved; i++) { stepSim(e); resolved = e.zombieAlive === 0 }
    expect(e.zombieAlive).toBe(0)
    expect(e.outcome).toBe('humans')
  })

  it('sustained fire depletes the magazine and forces a reload', () => {
    const e = createSim(cfg({ zombieCount: 30 }))
    frontline(e, 30)
    let sawReload = false
    for (let i = 0; i < 300; i++) { stepSim(e); if (e.reloadT[0] > 0) sawReload = true }
    expect(sawReload).toBe(true)
    expect(e.zombieAlive).toBeLessThan(30) // and it actually killed some
  })

  it('a kill enrages the surrounding horde', () => {
    const e = createSim(cfg({ zombieCount: 6 }))
    frontline(e, 6)
    let sawEnrage = false
    for (let i = 0; i < 200 && !sawEnrage; i++) {
      stepSim(e)
      for (let z = 0; z < e.n; z++) if (e.faction[z] === ZOMBIE && e.enrageT[z] > 0) sawEnrage = true
    }
    expect(sawEnrage).toBe(true)
  })

  it('a fighter cannot shoot a zombie through a wall (LOS gates fire)', () => {
    // A wall between the fighter and a point-blank zombie. With everyone frozen (speed 0),
    // the only way the zombie dies is a through-wall shot — which must not happen.
    const walled = createSim(cfg({ zombieCount: 1, zombieSpeed: 0, humanSpeed: 0 }))
    const wall = { x: 820, y: 380, w: 15, h: 140 }
    walled.arena = { walls: [wall], grid: buildWallGrid([wall], WORLD_W, WORLD_H) }
    walled.navGrid = createNavGrid(walled.arena, WORLD_W, WORLD_H)
    walled.px[0] = 800; walled.py[0] = 450; walled.px[1] = 850; walled.py[1] = 450 // wall between
    for (let i = 0; i < 200; i++) stepSim(walled)
    expect(walled.zombieAlive).toBe(1) // never shot through the wall

    // Control: same geometry, no wall → the fighter guns it down (proves it WOULD fire).
    const open = createSim(cfg({ zombieCount: 1, zombieSpeed: 0, humanSpeed: 0, arenaDensity: 0 }))
    open.px[0] = 800; open.py[0] = 450; open.px[1] = 850; open.py[1] = 450
    for (let i = 0; i < 200 && open.zombieAlive > 0; i++) stepSim(open)
    expect(open.zombieAlive).toBe(0)
  })

  it('a bullet dies when it enters a wall (no shooting through)', () => {
    const e = createSim(cfg({ zombieCount: 0 }))
    const wall = { x: 800, y: 400, w: 40, h: 40 }
    e.arena = { walls: [wall], grid: buildWallGrid([wall], WORLD_W, WORLD_H) }
    e.navGrid = createNavGrid(e.arena, WORLD_W, WORLD_H)
    // A live bullet just outside the wall, flying into it.
    e.bx[0] = 790; e.by[0] = 420; e.bvx[0] = 660; e.bvy[0] = 0; e.brange[0] = 400; e.balive[0] = 1
    stepSim(e)
    expect(e.balive[0]).toBe(0) // crossed into the wall this step → expired
  })
})
