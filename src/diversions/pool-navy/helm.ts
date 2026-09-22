// The helmsman: a heading order in, a rudder and a throttle out — plus the
// wall avoidance, which is a mechanism the prototype does NOT have.
//
// Dumb captain, competent helmsman. The captain decides *who* to chase; this
// file decides how to drive, and it is the only thing standing between a naive
// captain and a ship that fishtails down the pool. A ship that oscillates reads
// as broken; a ship that drives cleanly at a stupid target reads as dumb, which
// is the content we actually want.
//
// Pure logic — no Phaser, no Box2D.

import {
  FIXED_DT,
  HELM_CRUISE_THROTTLE,
  HELM_D_GAIN,
  HELM_P_GAIN,
  TURN_RADIUS_HULLS,
  WALL_AVOID_GAIN,
  WALL_MARGIN_RADII,
} from './config'
import { steadyTurnRate, type ShipSpec } from './hull'
import type { HullState } from './integrator'

/** What a captain hands the hull. */
export interface ShipControls {
  /** 0..1 */
  throttle: number
  /** -1 (hard port) .. +1 (hard starboard) */
  rudder: number
}

export interface Pool {
  readonly widthM: number
  readonly heightM: number
}

/**
 * Fold an angle into (−pi, pi].
 *
 * Every angular quantity in the sim is a difference of two headings, and the
 * shortest way round is always the right answer: a ship ordered 1 degree to
 * port must not take the 359-degree route, and a turret 179 degrees off must
 * not swing back through the whole arc when the target drifts past dead astern.
 * Lives here because heading error is where it first matters; turret bearings
 * are the same quantity measured from a different reference.
 */
export function wrapAngle(rad: number): number {
  const twoPi = Math.PI * 2
  const a = rad % twoPi
  if (a > Math.PI) return a - twoPi
  if (a <= -Math.PI) return a + twoPi
  return a
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * PD controller on heading error.
 *
 * The proportional term alone would be a disaster. A hull carries rotational
 * inertia and its rudder is a wing that keeps working right up until the error
 * reaches zero, so a pure-P helmsman arrives on the ordered heading at full yaw
 * rate and sails straight past it — then corrects, overshoots the other way,
 * and never stops. The derivative term is the counter-rudder a real helmsman
 * applies *before* the bow reaches the mark, and it is what holds overshoot
 * under five degrees.
 *
 * ⚠️ CORRECTED from the prototype, which states that claim as the reason the
 * term exists. MEASURED here: pure P overshoots 1.90 deg, which is already
 * inside five. The derivative term takes it to 0.00 deg. It earns its place —
 * but for precision, not for preventing a five-degree oscillation.
 *
 * The derivative is scaled by the ship's own steady turn rate rather than left
 * in raw rad/s, so one pair of gains works for a gunboat that pivots in a
 * quarter of a second and a dreadnought that does not. Unscaled, the same
 * number is four times as much damping on the heavy hull as on the light one.
 *
 * `prevError` is last tick's return value. Given it, the derivative is a true
 * finite difference, which also sees the *target* moving — a hull that is dead
 * steady while the ordered heading swings is still accumulating error, and a
 * controller that only watched its own yaw rate would be blind to that. Without
 * it (the first tick) the rate falls back to −omega, which is the same quantity
 * under the assumption that the order is not moving.
 *
 * Runs on the fixed sim tick; there is no variable-dt path by design, because
 * a derivative term on a jittery dt is a noise amplifier.
 */
export function helm(
  state: HullState,
  desiredHeadingRad: number,
  spec: ShipSpec,
  prevError?: number,
  dt: number = FIXED_DT,
): { controls: ShipControls; error: number } {
  const error = wrapAngle(desiredHeadingRad - state.heading)

  const errorRate =
    prevError === undefined ? -state.omega : wrapAngle(error - prevError) / dt

  const rudder = clamp(
    HELM_P_GAIN * error + HELM_D_GAIN * (errorRate / steadyTurnRate(spec)),
    -1,
    1,
  )

  // Full ahead, always. See HELM_CRUISE_THROTTLE for why there is no taper in
  // hard turns: the sideslip drag already charges for the turn, and cutting
  // throttle would cut the rudder authority needed to finish it.
  return { controls: { throttle: HELM_CRUISE_THROTTLE, rudder }, error }
}

// ---------------------------------------------------------------------------
// Wall avoidance
// ---------------------------------------------------------------------------

/**
 * ⚠️ REQUIRED, and absent from the prototype this is ported from.
 *
 * `rudderTorque` scales with `max(0, vForward)`, and the captain steers only at
 * the nearest enemy. So a hull that drives into a wall loses way, loses ALL
 * rudder authority, and full throttle holds it there permanently. Measured in
 * the probe with this turned off: 74.9% of ship-samples stalled, 99.9% of them
 * against a wall, mean speed down to 0.15 of top.
 *
 * It belongs HERE, at the helm — how you drive — beside the standoff arc, not
 * in the captain, which decides who to attack.
 *
 * The margin is the ship's own turn circle rather than a constant: a hull must
 * begin its turn at least a radius out or the geometry cannot save it.
 */
export function wallRepulsion(hull: HullState, pool: Pool, spec: ShipSpec): { x: number; y: number } {
  const margin = TURN_RADIUS_HULLS * spec.lengthM * WALL_MARGIN_RADII
  const push = (d: number): number => (d >= margin ? 0 : 1 - d / margin)
  return {
    x: push(hull.x) - push(pool.widthM - hull.x),
    y: push(hull.y) - push(pool.heightM - hull.y),
  }
}

/** Bend an ordered heading away from any wall inside the margin. */
export function avoidWalls(
  desiredHeadingRad: number,
  hull: HullState,
  pool: Pool,
  spec: ShipSpec,
): number {
  const r = wallRepulsion(hull, pool, spec)
  if (r.x === 0 && r.y === 0) return desiredHeadingRad
  return Math.atan2(
    Math.sin(desiredHeadingRad) + WALL_AVOID_GAIN * r.y,
    Math.cos(desiredHeadingRad) + WALL_AVOID_GAIN * r.x,
  )
}
