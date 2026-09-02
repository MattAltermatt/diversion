import { describe, it, expect } from 'vitest'
import { makeArena } from './testArena'
import { stepColony, reconcileDrones, blankAll } from './colony'
import { spawnDrone } from './recruit'
import { deposit } from './trails'
import { cellIndex, MOUND } from './grid'
import { BLANK, TRAIL_RECRUIT, WAIT_TIMEOUT, STOLEN_LIMIT, PICK_BUDGET } from './state'

const run = (s: ReturnType<typeof makeArena>, seconds: number, dt = 0.05) => {
  for (let t = 0; t < seconds; t += dt) stepColony(s, dt)
}
const leftEdge = (s: ReturnType<typeof makeArena>, row = 0) => [s.picOriginCol - 0.5, s.picOriginRow + row + 0.5] as const

describe('recruitment', () => {
  it('a blank drone touching an exposed piece takes its colour and gets a target', () => {
    const s = makeArena({ strength: 24 })
    const d = spawnDrone(s, ...leftEdge(s))
    stepColony(s, 0.01)
    expect(d.tint).toBe(0)
    expect(d.state).toBe('seeking')
    expect(d.target).toBeGreaterThanOrEqual(0)
  })

  it('a trail beats a touch', () => {
    const s = makeArena({ strength: 24 }, { bw: 2, bh: 2, idx: [0, 1, 0, 1] })
    const d = spawnDrone(s, ...leftEdge(s)) // touching colour 0
    deposit(s.trails, 1, cellIndex(s.grid, s.picOriginCol - 1, s.picOriginRow), TRAIL_RECRUIT * 3)
    stepColony(s, 0.01)
    expect(d.tint).toBe(1)
  })

  it('immunity blocks recruitment to that colour only', () => {
    const s = makeArena({ strength: 24 }, { bw: 2, bh: 2, idx: [0, 1, 0, 1] })
    const d = spawnDrone(s, 20.5, 5.5)
    d.immuneUntil[1] = 1e9
    deposit(s.trails, 1, cellIndex(s.grid, 20, 5), TRAIL_RECRUIT * 3)
    stepColony(s, 0.01)
    expect(d.tint).toBe(BLANK)
    deposit(s.trails, 0, cellIndex(s.grid, 20, 5), TRAIL_RECRUIT * 6)
    stepColony(s, 0.01)
    expect(d.tint).toBe(0)
  })

  it('a seeking drone lays its colour as it walks', () => {
    const s = makeArena({ strength: 24 })
    spawnDrone(s, 20.5, 5.5)
    deposit(s.trails, 0, cellIndex(s.grid, 20, 5), TRAIL_RECRUIT * 3)
    run(s, 2)
    let lit = 0
    for (let i = 0; i < s.trails.strength.length; i++) if (s.trails.strength[i] > 0 && s.trails.color[i] === 0) lit++
    expect(lit).toBeGreaterThan(3)
  })

  it('drains the pick queue at most PICK_BUDGET per frame', () => {
    const s = makeArena({ strength: 24 })
    for (let i = 0; i < PICK_BUDGET * 3; i++) {
      const d = spawnDrone(s, 20.5, 5.5)
      d.tint = 0; d.state = 'seeking'; d.target = -1
    }
    stepColony(s, 0.01)
    expect(s.drones.filter((d) => d.target >= 0).length).toBe(PICK_BUDGET)
    stepColony(s, 0.01)
    expect(s.drones.filter((d) => d.target >= 0).length).toBe(PICK_BUDGET * 2)
  })
})

describe('crews', () => {
  it('a piece heavier than one drone waits until ceil(mass/strength) carriers latch', () => {
    // One 4x4-block piece (mass 16), strength 6 → needs 3.
    const s = makeArena({ strength: 6, chunkSize: 16 })
    const chunk = s.chunks[0]
    expect(chunk.mass).toBe(16)
    for (let i = 0; i < 6; i++) spawnDrone(s, 25.5, 2.5 + i) // bystanders so the clamp is ≥ 3
    spawnDrone(s, ...leftEdge(s, 0)); spawnDrone(s, ...leftEdge(s, 1))
    run(s, 2)
    expect(chunk.crew?.carriers.length).toBe(2)
    expect(chunk.where).toBe('picture')
    spawnDrone(s, ...leftEdge(s, 2))
    run(s, 2)
    expect(chunk.where).toBe('lifted')
    expect(chunk.crew?.moving).toBe(true)
  })

  it('clamps the crew to half the colony', () => {
    const s = makeArena({ strength: 1, chunkSize: 16 })
    for (let r = 0; r < 4; r++) spawnDrone(s, ...leftEdge(s, r))
    run(s, 3)
    expect(s.chunks[0].where).toBe('lifted') // needs min(16, max(1, 4/2)) = 2
  })

  it('a crew that never fills releases, and the waiters go blank with immunity', () => {
    const s = makeArena({ strength: 1, chunkSize: 16 })
    // Colony of 11 → needs 5; the ten bystanders are immune so nobody else can join.
    for (let i = 0; i < 10; i++) spawnDrone(s, 25.5, 2.5 + (i % 3)).immuneUntil[0] = 1e9
    const d = spawnDrone(s, ...leftEdge(s))
    run(s, 1)
    expect(d.state).toBe('latched')
    run(s, WAIT_TIMEOUT + 1)
    expect(d.state).not.toBe('latched')
    // Bystanders may have formed a fresh crew on the piece by now; this drone is not in it.
    expect(s.chunks[0].crew?.carriers ?? []).not.toContain(d)
    expect(d.tint).toBe(BLANK)
    expect(d.immuneUntil[0]).toBeGreaterThan(s.time)
  })

  it('carries a piece to the mound, places it, and the drone re-seeks', () => {
    const s = makeArena({ strength: 24, chunkSize: 4 })
    const d = spawnDrone(s, ...leftEdge(s))
    run(s, 15)
    const moved = s.chunks.filter((c) => c.where === 'mound')
    expect(moved.length).toBeGreaterThan(0)
    for (const c of moved) for (const i of c.at!) { expect(s.grid.occ[i]).toBe(MOUND); expect(s.grid.forbid[i]).toBe(0) }
    expect(s.dirty.length).toBeGreaterThan(0)
    expect(['seeking', 'latched', 'carrying']).toContain(d.state)
  })
})

describe('going blank', () => {
  it('colour exhausted at pick time → blank and immune to that colour only', () => {
    const s = makeArena({ strength: 24, immunity: 10 }, { bw: 2, bh: 2, idx: [0, 1, 0, 1] })
    const d = spawnDrone(s, 20.5, 5.5)
    deposit(s.trails, 1, cellIndex(s.grid, 20, 5), TRAIL_RECRUIT * 3)
    stepColony(s, 0.01)
    expect(d.tint).toBe(1)
    for (const c of s.chunks) if (c.color === 1) c.where = 'mound'
    run(s, 1)
    expect(d.tint).toBe(BLANK)
    expect(d.immuneUntil[1]).toBeGreaterThan(s.time)
    expect(d.immuneUntil[0]).toBeLessThanOrEqual(s.time)
  })

  it(`goes blank after ${STOLEN_LIMIT} stolen targets`, () => {
    const s = makeArena({ strength: 24 }, { bw: 1, bh: 1, idx: [0] })
    const d = spawnDrone(s, 20.5, 5.5)
    deposit(s.trails, 0, cellIndex(s.grid, 20, 5), TRAIL_RECRUIT * 3)
    stepColony(s, 0.01)
    d.stolen = STOLEN_LIMIT - 1
    s.chunks[0].where = 'lifted'; s.chunks[0].at = null
    run(s, 10)
    expect(d.tint).toBe(BLANK)
  })

  it('nothing is eligible during rest, and blankAll clears immunities', () => {
    const s = makeArena({ strength: 24 })
    s.phase = 'rest'
    const d = spawnDrone(s, ...leftEdge(s))
    d.immuneUntil[0] = 1e9
    run(s, 1)
    expect(d.tint).toBe(BLANK)
    blankAll(s)
    expect(d.immuneUntil[0]).toBe(0)
  })
})

describe('reconcileDrones', () => {
  it('trims blank drones first, and spawns only on reachable free cells', () => {
    const s = makeArena()
    for (let i = 0; i < 5; i++) spawnDrone(s, 20.5 + i, 5.5)
    s.drones[0].state = 'seeking'; s.drones[0].tint = 0; s.drones[0].target = -1
    reconcileDrones(s, 2)
    expect(s.drones.length).toBe(2)
    expect(s.drones[0].state).toBe('seeking')
    reconcileDrones(s, 30)
    expect(s.drones.length).toBe(30)
    for (const d of s.drones.slice(2)) {
      expect(d.state).toBe('blank')
      const i = cellIndex(s.grid, Math.floor(d.x), Math.floor(d.y))
      expect(s.grid.occ[i]).toBe(0); expect(s.grid.reach[i]).toBe(1)
    }
  })

  it('a retiring drone leaves as soon as it is free', () => {
    const s = makeArena({ strength: 24, chunkSize: 4 })
    const d = spawnDrone(s, ...leftEdge(s))
    run(s, 1)
    d.retiring = true
    run(s, 40)
    expect(s.drones).not.toContain(d)
  })
})
