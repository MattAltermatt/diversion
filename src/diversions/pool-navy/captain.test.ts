import { describe, expect, it } from 'vitest'
import { GUNBOAT } from './hull'
import type { Pool } from './helm'
import { initialState } from './integrator'
import { arcSign, captainTick, type ShipView } from './captain'

const POOL: Pool = { widthM: 8, heightM: 4.5 }
const view = (id: string, faction: string, x: number, y: number, hp = GUNBOAT.hp): ShipView =>
  ({ id, faction, spec: GUNBOAT, x, y, hp })

describe('captain', () => {
  it('chases the nearest enemy and ignores its own side', () => {
    const self = view('a', '0', 4, 2.25)
    const world = [self, view('friend', '0', 4.2, 2.25), view('far', '1', 6, 2.25)]
    const d = captainTick({ self, hull: initialState({ x: 4, y: 2.25 }), world, pool: POOL })
    expect(d.captain.targetId).toBe('far')
  })

  it('ignores the dead', () => {
    const self = view('a', '0', 4, 2.25)
    const world = [self, view('corpse', '1', 4.3, 2.25, 0), view('live', '1', 6, 2.25)]
    const d = captainTick({ self, hull: initialState({ x: 4, y: 2.25 }), world, pool: POOL })
    expect(d.captain.targetId).toBe('live')
  })

  it('holds its target until something is MEANINGFULLY nearer', () => {
    const self = view('a', '0', 4, 2.25)
    const d = captainTick({
      self,
      hull: initialState({ x: 4, y: 2.25 }),
      world: [self, view('held', '1', 5.0, 2.25), view('rival', '1', 4.95, 2.25)],
      pool: POOL,
      prevTargetId: 'held',
    })
    expect(d.captain.targetId).toBe('held')
  })

  it('...but does switch when one really is closer', () => {
    const self = view('a', '0', 4, 2.25)
    const d = captainTick({
      self,
      hull: initialState({ x: 4, y: 2.25 }),
      world: [self, view('held', '1', 6.0, 2.25), view('rival', '1', 4.4, 2.25)],
      pool: POOL,
      prevTargetId: 'held',
    })
    expect(d.captain.targetId).toBe('rival')
  })

  it('goes idle with nothing to shoot at', () => {
    const self = view('a', '0', 4, 2.25)
    const d = captainTick({ self, hull: initialState({ x: 4, y: 2.25 }), world: [self], pool: POOL })
    expect(d.captain.targetId).toBeNull()
    expect(d.captain.throttle).toBe(0)
  })

  // Pure pursuit is radial, and radial motion has near-zero bearing rate — so
  // without an arc the traverse limit never binds and the evasion mechanic is
  // inert. The bow must point off the target once engaged.
  it('steers to a TANGENT once inside engagement range, not at the target', () => {
    const self = view('a', '0', 4, 2.25)
    const d = captainTick({
      self,
      hull: initialState({ x: 4, y: 2.25 }),
      world: [self, view('e', '1', 4.9, 2.25)],
      pool: POOL,
    })
    expect(d.captain.intent).toBe('engaging')
    expect(Math.abs(d.captain.desiredHeadingRad)).toBeGreaterThan(0.2)
  })

  it('closes head-on while still out of range', () => {
    const self = view('a', '0', 1, 2.25)
    const d = captainTick({
      self,
      hull: initialState({ x: 1, y: 2.25 }),
      world: [self, view('e', '1', 6, 2.25)],
      pool: POOL,
    })
    expect(d.captain.intent).toBe('closing')
    expect(Math.abs(d.captain.desiredHeadingRad)).toBeLessThan(0.2)
  })

  it('arcSign is a stable hash that splits a pack both ways', () => {
    expect(arcSign('f2-7')).toBe(arcSign('f2-7'))
    const plus = Array.from({ length: 60 }, (_, i) => `f${i}-${i}`).filter((i) => arcSign(i) === 1).length
    expect(plus).toBeGreaterThan(12)
    expect(plus).toBeLessThan(48)
  })
})
