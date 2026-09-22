import { describe, expect, it } from 'vitest'
import { GUNBOAT } from './hull'
import { initialState } from './integrator'
import type { Ship } from './ship'
import { WEAPONS } from './weapons'
import { applyDamage, launch, stepProjectiles, type World } from './projectiles'

const ship = (id: string, faction: string, x: number, y: number): Ship => ({
  id, faction, factionIndex: Number(faction), spec: GUNBOAT, weapon: WEAPONS.cannon,
  hp: GUNBOAT.hp, alive: true, hull: initialState({ x, y }),
  turretBearing: 0, reload: 0, captain: null, prevHeadingError: undefined,
  stalledFor: 0, trail: [],
})

const world = (...ships: Ship[]): World => ({
  ships, shells: [], beams: [], splashes: [], flashes: [],
  hitRadius: GUNBOAT.lengthM * 0.45, sunk: [],
})

describe('projectiles', () => {
  it('a cannon resolves at FIRE TIME and cannot miss', () => {
    const w = world(ship('a', '0', 0, 0), ship('b', '1', 1, 0))
    launch(w, w.ships[0]!, w.ships[1]!, WEAPONS.cannon)
    expect(w.ships[1]!.hp).toBe(GUNBOAT.hp - WEAPONS.cannon.damage) // BEFORE any step
  })

  it('a missile is harmless until it ARRIVES', () => {
    const w = world(ship('a', '0', 0, 0), ship('b', '1', 1.5, 0))
    launch(w, w.ships[0]!, w.ships[1]!, WEAPONS.missile)
    expect(w.ships[1]!.hp).toBe(GUNBOAT.hp)
    for (let i = 0; i < 400; i++) stepProjectiles(w, 1 / 120)
    expect(w.ships[1]!.hp).toBeLessThan(GUNBOAT.hp)
  })

  // The guidance axis. ⚠️ Assert the STEERING, not a hit: with a 2.75 m turn
  // radius a missile genuinely cannot reach a target that jumps 1 m off the
  // firing line inside 1.6 m of run — that inability IS what 25 deg/s buys,
  // so an outcome test here would be demanding the bug.
  it('a missile STEERS toward a target that moves off the firing line', () => {
    const w = world(ship('a', '0', 0, 0), ship('b', '1', 3, 0))
    launch(w, w.ships[0]!, w.ships[1]!, WEAPONS.missile)
    const before = Math.atan2(w.shells[0]!.vy, w.shells[0]!.vx)
    w.ships[1]!.hull.y = 2
    for (let i = 0; i < 120; i++) stepProjectiles(w, 1 / 120)
    const after = Math.atan2(w.shells[0]!.vy, w.shells[0]!.vx)
    expect(after).toBeGreaterThan(before + 0.1)
    // ...and no faster than its rated turn rate over that one second.
    expect((after - before) * (180 / Math.PI)).toBeLessThanOrEqual(WEAPONS.missile.turnRateDegPerSec + 1)
  })

  it('a missile HITS a target that drifts only gently off the line', () => {
    const w = world(ship('a', '0', 0, 0), ship('b', '1', 2.0, 0))
    launch(w, w.ships[0]!, w.ships[1]!, WEAPONS.missile)
    w.ships[1]!.hull.y = 0.25
    for (let i = 0; i < 400; i++) stepProjectiles(w, 1 / 120)
    expect(w.ships[1]!.hp).toBeLessThan(GUNBOAT.hp)
  })

  it('a missile whose target is gone expires unspent', () => {
    const w = world(ship('a', '0', 0, 0), ship('b', '1', 1.5, 0))
    launch(w, w.ships[0]!, w.ships[1]!, WEAPONS.missile)
    w.ships[1]!.alive = false
    for (let i = 0; i < 2000; i++) stepProjectiles(w, 1 / 120)
    expect(w.shells.length).toBe(0)
    expect(w.ships[1]!.hp).toBe(GUNBOAT.hp)
  })

  // The torpedo's whole reason for existing.
  it('a torpedo hits a FRIENDLY that wanders into its path', () => {
    const w = world(ship('a', '0', 0, 0), ship('enemy', '1', 2, 0), ship('mate', '0', 1, 0))
    launch(w, w.ships[0]!, w.ships[1]!, WEAPONS.torpedo)
    for (let i = 0; i < 400; i++) stepProjectiles(w, 1 / 120)
    expect(w.ships[2]!.hp).toBeLessThan(GUNBOAT.hp) // the friend
    expect(w.ships[1]!.hp).toBe(GUNBOAT.hp)          // not the enemy
  })

  it('a torpedo never hits the hull that launched it', () => {
    const w = world(ship('a', '0', 0, 0), ship('b', '1', 2, 0))
    launch(w, w.ships[0]!, w.ships[1]!, WEAPONS.torpedo)
    for (let i = 0; i < 20; i++) stepProjectiles(w, 1 / 120)
    expect(w.ships[0]!.hp).toBe(GUNBOAT.hp)
  })

  it('a cannon shell does NOT hit a friendly it passes through', () => {
    const w = world(ship('a', '0', 0, 0), ship('enemy', '1', 2, 0), ship('mate', '0', 1, 0))
    launch(w, w.ships[0]!, w.ships[1]!, WEAPONS.cannon)
    for (let i = 0; i < 400; i++) stepProjectiles(w, 1 / 120)
    expect(w.ships[2]!.hp).toBe(GUNBOAT.hp)
  })

  // ⭐ The channel the escalation rule rides on.
  it('a kill is REPORTED on the sunk queue, from either damage model', () => {
    const w = world(ship('a', '0', 0, 0), ship('b', '1', 0.5, 0))
    // Bounded: an unbounded `while (alive)` HANGS instead of failing if
    // fire-time damage is ever removed, which turns a caught mutant into a
    // stuck test run.
    let shots = 0
    while (w.ships[1]!.alive && shots++ < 200) launch(w, w.ships[0]!, w.ships[1]!, WEAPONS.cannon)
    expect(shots).toBeLessThan(200)
    expect(w.sunk.map((s) => s.id)).toEqual(['b'])

    const w2 = world(ship('a', '0', 0, 0), ship('b', '1', 1.2, 0))
    w2.ships[1]!.hp = 1
    launch(w2, w2.ships[0]!, w2.ships[1]!, WEAPONS.torpedo)
    for (let i = 0; i < 400; i++) stepProjectiles(w2, 1 / 120)
    expect(w2.sunk.map((s) => s.id)).toEqual(['b'])
  })

  it('armor removes its fraction of incoming damage', () => {
    const w = world(ship('a', '0', 0, 0), ship('b', '1', 1, 0))
    w.ships[1]!.spec = { ...GUNBOAT, armor: 0.5 }
    applyDamage(w, w.ships[1]!, 10)
    expect(w.ships[1]!.hp).toBe(GUNBOAT.hp - 5)
  })

  it('a dead hull cannot be killed twice', () => {
    const w = world(ship('a', '0', 0, 0), ship('b', '1', 1, 0))
    w.ships[1]!.hp = 1
    applyDamage(w, w.ships[1]!, 99)
    applyDamage(w, w.ships[1]!, 99)
    expect(w.sunk.length).toBe(1)
  })

  it('every expiring round leaves a splash', () => {
    const w = world(ship('a', '0', 0, 0), ship('b', '1', 0.5, 0))
    launch(w, w.ships[0]!, w.ships[1]!, WEAPONS.cannon)
    for (let i = 0; i < 20; i++) stepProjectiles(w, 1 / 120)
    expect(w.splashes.length).toBeGreaterThan(0)
  })
})
