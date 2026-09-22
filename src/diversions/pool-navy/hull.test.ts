import { describe, expect, it } from 'vitest'
import { TURN_RADIUS_HULLS } from './config'
import { GUNBOAT, dreadnoughtSpec, gunboatSpec, hullDrag, rudderTorque } from './hull'
import { initialState, run, speed, step } from './integrator'

describe('hull physics', () => {
  it('reaches 95% of top speed in its stated time', () => {
    const s = run(initialState(), 1, 0, GUNBOAT, GUNBOAT.timeToTopSpeedSec)
    expect(speed(s) / GUNBOAT.topSpeedMs).toBeCloseTo(0.95, 2)
  })

  it('settles at top speed, not above it', () => {
    const s = run(initialState(), 1, 0, GUNBOAT, 40)
    expect(speed(s)).toBeCloseTo(GUNBOAT.topSpeedMs, 2)
  })

  // The single difference between a boat and an air-hockey puck.
  //
  // ⚠️ Bounded by a LITERAL, not by LATERAL_DRAG_RATIO. Deriving the bound from
  // the constant under test makes both sides move together, so setting the
  // ratio to 1 — deleting the mechanic — leaves the test green. That exact
  // tautology was caught in review.
  it('resists sideways motion an order of magnitude harder than forward', () => {
    const fwd = Math.abs(hullDrag(0.3, 0, GUNBOAT).forward)
    const lat = Math.abs(hullDrag(0, 0.3, GUNBOAT).lateral)
    expect(lat / fwd).toBeGreaterThan(10)
  })

  // The integration consequence of the above: a sideways kick dies almost at
  // once while the same kick forward carries the hull a long way.
  it('a sideways kick stops in a fraction of the distance a forward one carries', () => {
    const side = initialState({ heading: 0, vx: 0, vy: 0.4 })
    const ahead = initialState({ heading: 0, vx: 0.4, vy: 0 })
    run(side, 0, 0, GUNBOAT, 3)
    run(ahead, 0, 0, GUNBOAT, 3)
    expect(Math.abs(side.y)).toBeLessThan(Math.abs(ahead.x) / 5)
  })

  // ⚠️ THE mechanism behind the wall-pin defect: a rudder is a wing, and with
  // no flow there is no moment. Measured without wall avoidance: 74.9% of
  // ship-samples stalled, 99.9% of them against a wall.
  it('CANNOT steer when dead in the water', () => {
    const s = initialState()
    step(s, 0, 1, GUNBOAT, 1 / 120)
    expect(s.omega).toBe(0)
    expect(rudderTorque(1, 0, GUNBOAT)).toBe(0)
  })

  it('turns at roughly TURN_RADIUS_HULLS hull lengths at cruise', () => {
    const s = run(initialState(), 1, 0, GUNBOAT, 20)
    run(s, 1, 1, GUNBOAT, 20)
    const radius = speed(s) / Math.abs(s.omega) / GUNBOAT.lengthM
    expect(radius).toBeGreaterThan(TURN_RADIUS_HULLS * 0.7)
    expect(radius).toBeLessThan(TURN_RADIUS_HULLS * 1.5)
  })

  it('the roster tracks the live config rather than a baked constant', () => {
    expect(gunboatSpec(0.9, 200).topSpeedMs).toBe(0.9)
    expect(gunboatSpec(0.9, 200).hp).toBe(200)
  })

  // ⚠️ The prototype's dreadnought is faster than this roster's gunboat. If it
  // ships unrescaled it is the fastest thing in the pool.
  it('a dreadnought is the SLOWEST and toughest thing in the pool', () => {
    const g = gunboatSpec(0.5, 90)
    const d = dreadnoughtSpec(0.5, 90)
    expect(d.topSpeedMs).toBeLessThan(g.topSpeedMs)
    expect(d.hp).toBeGreaterThan(g.hp * 3)
    expect(d.lengthM).toBeGreaterThan(g.lengthM * 2)
  })
})
