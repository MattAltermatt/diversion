import { describe, expect, it } from 'vitest'
import { TURN_RADIUS_HULLS } from './config'
import { GUNBOAT } from './hull'
import { ROLLABLE, WEAPONS, desiredBearing, onBearing, trackTurret, weaponFor } from './weapons'

const HULL_TURN_RADIUS = TURN_RADIUS_HULLS * GUNBOAT.lengthM // 0.75 m

describe('weapons', () => {
  it('bearing is relative to the HULL, so yawing the ship moves it', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 1, y: 0 }
    expect(desiredBearing(0, from, to)).toBeCloseTo(0, 6)
    expect(desiredBearing(Math.PI / 2, from, to)).toBeCloseTo(-Math.PI / 2, 6)
  })

  it('a turret cannot slew faster than its rated traverse', () => {
    const next = trackTurret(0, 0, { x: 0, y: 0 }, { x: 0, y: 1 }, 45, 1 / 120)
    expect((Math.abs(next) * 180) / Math.PI).toBeCloseTo(45 / 120, 4)
  })

  it('refuses to fire while off bearing', () => {
    expect(onBearing(0, 0, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true)
    expect(onBearing(0, 0, { x: 0, y: 0 }, { x: 0, y: 1 })).toBe(false)
  })

  // ⚠️ Bounded at 2.0 m, NOT at the hull's 0.75 m. At 60 deg/s the missile's
  // radius is 1.15 m, which is ALSO greater than 0.75 — so a 0.75 bound passes
  // for the very value this number exists to rule out. Measured: 60 deg/s
  // misses 0.8% of the time (no guidance axis at all), 25 deg/s misses 11.7%.
  it('a missile is genuinely out-turnable, at a radius 60 deg/s cannot reach', () => {
    const m = WEAPONS.missile
    const radius = m.speedMs / ((m.turnRateDegPerSec * Math.PI) / 180)
    expect(radius).toBeGreaterThan(2.0)
    expect(radius).toBeGreaterThan(HULL_TURN_RADIUS * 2.5)
  })

  it('every rollable mount owns a distinct axis, not just a damage number', () => {
    const rolls = ROLLABLE.map((k) => WEAPONS[k])
    // Reach, traverse and rate must each span a real range across the roster.
    const span = (f: (w: (typeof rolls)[0]) => number): number =>
      Math.max(...rolls.map(f)) / Math.min(...rolls.map(f))
    expect(span((w) => w.rangeM)).toBeGreaterThan(5)
    expect(span((w) => w.traverseDegPerSec)).toBeGreaterThan(10)
    expect(new Set(rolls.map((w) => w.hitsAnyone)).size).toBe(2)
    // No two mounts are the same weapon wearing a different name.
    const shapes = rolls.map((w) =>
      [w.traverseDegPerSec, w.rangeM, w.rateOfFirePerSec, w.damage].join('|'))
    expect(new Set(shapes).size).toBe(rolls.length)
  })

  it('only the long-running rounds hit their own side', () => {
    expect(WEAPONS.torpedo.hitsAnyone).toBe(true)
    expect(WEAPONS.cannon.hitsAnyone).toBe(false)
    expect(WEAPONS.laser.hitsAnyone).toBe(false)
  })

  it('the heavy mount is the dreadnought thesis, and the sim reads it', () => {
    // Needs this to hold a 0.5 m/s gunboat at its own range; it has less.
    const needed = (GUNBOAT.topSpeedMs / WEAPONS.heavy.rangeM) * (180 / Math.PI)
    expect(WEAPONS.heavy.traverseDegPerSec).toBeLessThan(needed)
    expect(WEAPONS.heavy.damage).toBeGreaterThan(WEAPONS.cannon.damage * 3)
  })

  it('a gunboat never rolls the heavy mount', () => {
    expect(ROLLABLE).not.toContain('heavy')
    const kinds = new Set(
      Array.from({ length: 400 }, (_, i) => weaponFor(`f${i % 40}-${i}`).kind),
    )
    expect(kinds.has('heavy')).toBe(false)
    expect(kinds.size).toBe(ROLLABLE.length)
  })

  it('assignment is deterministic', () => {
    expect(weaponFor('f3-9').kind).toBe(weaponFor('f3-9').kind)
  })

  // ⚠️ `toBe(4)`, not `> 1`. Without the second avalanche each trailing digit
  // collapses to exactly TWO kinds in a 4-cycle keyed to spawn order — and
  // 2 > 1, so a "more than one" assertion cannot see the defect.
  it('weapon does not track spawn order', () => {
    const byTail = new Map<string, Set<string>>()
    for (let i = 0; i < 400; i++) {
      const tail = String(i % 10)
      const k = weaponFor(`f${Math.floor(i / 10)}-${i}`).kind
      if (!byTail.has(tail)) byTail.set(tail, new Set())
      byTail.get(tail)!.add(k)
    }
    for (const [tail, kinds] of byTail) expect(kinds.size, `tail ${tail}`).toBe(ROLLABLE.length)
  })
})
