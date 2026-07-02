import { describe, it, expect } from 'vitest'
import { createSim, stepSim, ZOMBIE, type SimConfig } from './sim'

const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({
  civilianCount: 0, fighterCount: 1, zombieCount: 1,
  zombieSpeed: 52, humanSpeed: 88, seed: 7,
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
})
