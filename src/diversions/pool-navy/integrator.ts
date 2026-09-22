// Deterministic fixed-step integrator. Ported from the ship-arena prototype.
//
// This is what replaces Box2D: it applies the identical force model, so the
// only things hand-rolled elsewhere are wall contact and hull separation.
//
// This exists so every physics assertion in the test suite runs in node at
// sub-second speed against the SAME force model the Box2D binding applies.
// Box2D integrates the forces; this integrates them too. If the two ever
// disagree it is a binding bug, which is exactly what we want to be able to
// see.

import { FIXED_DT } from './config'
import { hullForces, momentOfInertia, type ShipSpec } from './hull'


export interface HullState {
  x: number
  y: number
  /** Radians, 0 = +x. */
  heading: number
  /** World-frame velocity. */
  vx: number
  vy: number
  /** Radians per second. */
  omega: number
}

export function initialState(partial: Partial<HullState> = {}): HullState {
  return { x: 0, y: 0, heading: 0, vx: 0, vy: 0, omega: 0, ...partial }
}

/** World velocity expressed in the hull frame. */
export function toHullFrame(s: HullState): { forward: number; lateral: number } {
  const c = Math.cos(s.heading)
  const sn = Math.sin(s.heading)
  return { forward: s.vx * c + s.vy * sn, lateral: -s.vx * sn + s.vy * c }
}

/** Advance one fixed step. Mutates and returns the state. */
export function step(
  s: HullState,
  throttle: number,
  rudder: number,
  spec: ShipSpec,
  dt: number = FIXED_DT,
): HullState {
  const { forward, lateral } = toHullFrame(s)
  const f = hullForces(throttle, rudder, forward, lateral, s.omega, spec)

  // Hull-frame force back to world.
  const c = Math.cos(s.heading)
  const sn = Math.sin(s.heading)
  const fx = f.forward * c - f.lateral * sn
  const fy = f.forward * sn + f.lateral * c

  s.vx += (fx / spec.massKg) * dt
  s.vy += (fy / spec.massKg) * dt
  s.omega += (f.torque / momentOfInertia(spec)) * dt

  s.x += s.vx * dt
  s.y += s.vy * dt
  s.heading += s.omega * dt

  return s
}

/** Run n fixed steps with constant controls. */
export function run(
  s: HullState,
  throttle: number,
  rudder: number,
  spec: ShipSpec,
  seconds: number,
  dt: number = FIXED_DT,
): HullState {
  const n = Math.round(seconds / dt)
  for (let i = 0; i < n; i++) step(s, throttle, rudder, spec, dt)
  return s
}

export function speed(s: HullState): number {
  return Math.hypot(s.vx, s.vy)
}
