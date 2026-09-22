import { describe, expect, it } from 'vitest'
import {
  TURN_RADIUS_HULLS,
  WALL_FRICTION,
  WALL_MARGIN_RADII,
  WALL_RESTITUTION,
  WAY_FRACTION,
} from './config'
import { GUNBOAT } from './hull'
import { avoidWalls, helm, wallRepulsion, wrapAngle, type Pool } from './helm'
import { initialState, run, speed, step, type HullState } from './integrator'

const POOL: Pool = { widthM: 8, heightM: 4.5 }

/**
 * The pool wall, exactly as sim.ts applies it.
 *
 * ⚠️ This is the whole test, and an earlier draft got it wrong: a POSITION
 * clamp pins x but leaves vx at terminal forever, so a hull with avoidance
 * disabled still reads 0.50 m/s and the regression test passes. What actually
 * removes way is the restitution/friction bounce.
 */
function bounce(h: HullState, spec = GUNBOAT): void {
  const r = spec.lengthM * 0.4
  if (h.x < r) {
    h.x = r
    if (h.vx < 0) { h.vx = -h.vx * WALL_RESTITUTION; h.vy *= 1 - WALL_FRICTION }
  } else if (h.x > POOL.widthM - r) {
    h.x = POOL.widthM - r
    if (h.vx > 0) { h.vx = -h.vx * WALL_RESTITUTION; h.vy *= 1 - WALL_FRICTION }
  }
  if (h.y < r) {
    h.y = r
    if (h.vy < 0) { h.vy = -h.vy * WALL_RESTITUTION; h.vx *= 1 - WALL_FRICTION }
  } else if (h.y > POOL.heightM - r) {
    h.y = POOL.heightM - r
    if (h.vy > 0) { h.vy = -h.vy * WALL_RESTITUTION; h.vx *= 1 - WALL_FRICTION }
  }
}

/** Drive due west at full throttle for 30 s, with avoidance on or off. */
function driveAtWall(avoid: boolean): number {
  const s = initialState({ x: 4, y: 2.25, heading: Math.PI })
  let prev: number | undefined
  for (let i = 0; i < 30 * 120; i++) {
    const want = avoid ? avoidWalls(Math.PI, s, POOL, GUNBOAT) : Math.PI
    const r = helm(s, want, GUNBOAT, prev)
    prev = r.error
    step(s, r.controls.throttle, r.controls.rudder, GUNBOAT, 1 / 120)
    bounce(s)
  }
  return speed(s)
}

describe('helm', () => {
  it('takes the short way round', () => {
    expect(wrapAngle(Math.PI * 1.9)).toBeCloseTo(-Math.PI * 0.1, 6)
    expect(wrapAngle(-Math.PI * 1.9)).toBeCloseTo(Math.PI * 0.1, 6)
  })

  // ⚠️ The bound is 0.5 deg, not the prototype comment's 5 deg. MEASURED: with
  // the derivative term overshoot is 0.00 deg; with a pure-P helm it is 1.90.
  // So the ported claim that the D term "is what holds overshoot under five
  // degrees" is false — pure P already does — and a 5 deg bound cannot tell
  // the two apart. At 0.5 deg, deleting the D term fails this test.
  it('holds overshoot under 0.5 degrees on a 90-degree order', () => {
    const s = run(initialState(), 1, 0, GUNBOAT, 8)
    const want = Math.PI / 2
    let prev: number | undefined
    let worst = 0
    for (let i = 0; i < 1200; i++) {
      const r = helm(s, want, GUNBOAT, prev)
      prev = r.error
      step(s, r.controls.throttle, r.controls.rudder, GUNBOAT, 1 / 120)
      worst = Math.max(worst, wrapAngle(s.heading - want))
    }
    expect((worst * 180) / Math.PI).toBeLessThan(0.5)
  })

  it('pushes away from a near wall and is silent in open water', () => {
    expect(wallRepulsion(initialState({ x: 0.05, y: 2.25 }), POOL, GUNBOAT).x).toBeGreaterThan(0.9)
    expect(wallRepulsion(initialState({ x: 4, y: 2.25 }), POOL, GUNBOAT)).toEqual({ x: 0, y: 0 })
  })

  it('the margin is the ship OWN turn circle, not a constant', () => {
    const margin = TURN_RADIUS_HULLS * GUNBOAT.lengthM * WALL_MARGIN_RADII
    expect(wallRepulsion(initialState({ x: margin * 0.99, y: 2.25 }), POOL, GUNBOAT).x).toBeGreaterThan(0)
    expect(wallRepulsion(initialState({ x: margin * 1.01, y: 2.25 }), POOL, GUNBOAT).x).toBe(0)
  })

  // ⭐ THE regression test for the defect this module exists to prevent.
  it('a hull ordered straight into a wall does NOT pin itself', () => {
    expect(driveAtWall(true)).toBeGreaterThan(WAY_FRACTION * GUNBOAT.topSpeedMs)
  })

  // Non-vacuity, asserted rather than assumed: the same drive WITHOUT
  // avoidance must actually pin. If this ever passes, the test above is
  // measuring nothing and the one before it is the only thing that would say so.
  it('...and WOULD pin without it — the test above is not vacuous', () => {
    expect(driveAtWall(false)).toBeLessThan(WAY_FRACTION * GUNBOAT.topSpeedMs)
  })
})
