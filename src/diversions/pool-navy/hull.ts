// Pure hull hydrodynamics. No Phaser, no Box2D — this file must stay
// importable in a node test with nothing else loaded.

import {
  ANGULAR_DRAG_FACTOR,
  LATERAL_DRAG_RATIO,
  LINEAR_DRAG_FRACTION,
  TURN_RADIUS_HULLS,
  DEFAULTS,
} from './config'

/** One hull's physical and combat figures. */
export interface ShipSpec {
  readonly cls: 'gunboat' | 'dreadnought'
  readonly lengthM: number
  readonly beamM: number
  readonly massKg: number
  readonly topSpeedMs: number
  /** Seconds to reach 95% of top speed. Closes the thrust/drag system. */
  readonly timeToTopSpeedSec: number
  readonly gunRangeM: number
  readonly hp: number
  /** Fraction of incoming damage removed. */
  readonly armor: number
}

export interface HullForces {
  /** Along the hull, positive toward the bow. Newtons. */
  forward: number
  /** Across the hull, positive to starboard. Newtons. */
  lateral: number
  /** Newton-metres, positive turning to starboard. */
  torque: number
}

/**
 * Drag on a hull, decomposed in the HULL frame.
 *
 * A hull moving forward is slippery; a hull moving sideways is a brick. That
 * asymmetry is what a keel is for, and it is the single difference between a
 * boat and an air-hockey puck. Box2D's linearDamping is isotropic and linear,
 * so it cannot express this — hence a manual force every step.
 *
 * Each axis carries a quadratic term (which hands us terminal velocity for
 * free: thrust == drag at some speed, no artificial cap needed) plus a linear
 * term. The linear term matters more than it looks: pure quadratic drag has
 * zero slope at v=0, so a ship that loses way would coast almost indefinitely
 * and could never actually be dead in the water.
 */
export function hullDrag(
  vForward: number,
  vLateral: number,
  spec: ShipSpec,
): { forward: number; lateral: number } {
  const kQuad = forwardDragCoefficient(spec)
  const kLin = LINEAR_DRAG_FRACTION * kQuad * spec.topSpeedMs

  const drag = (v: number, scale: number): number =>
    -(kLin * scale * v + kQuad * scale * v * Math.abs(v))

  return {
    forward: drag(vForward, 1),
    lateral: drag(vLateral, LATERAL_DRAG_RATIO),
  }
}

/** Angular drag. Quadratic, so a hull does not spin forever. */
export function angularDrag(omega: number, spec: ShipSpec): number {
  const k = angularDragCoefficient(spec)
  return -(LINEAR_DRAG_FRACTION * k * omega + k * omega * Math.abs(omega))
}

/**
 * Rudder torque.
 *
 * A rudder is a wing: no flow over it, no turning moment. Torque scales with
 * deflection AND with forward speed, which means a stopped ship cannot steer
 * at all. That removes pivot-and-shoot entirely — a ship has to commit to a
 * turn arc, and being caught dead in the water is close to a death sentence.
 */
export function rudderTorque(rudder: number, vForward: number, spec: ShipSpec): number {
  const clamped = Math.max(-1, Math.min(1, rudder))
  return clamped * Math.max(0, vForward) * rudderGain(spec)
}

/** Thrust along the hull for a throttle setting. */
export function thrustForce(throttle: number, spec: ShipSpec): number {
  return Math.max(0, Math.min(1, throttle)) * thrustNewtons(spec)
}

/**
 * Yaw rate a hull sustains at cruise with the rudder hard over.
 *
 * This is the natural scale for anything that reasons about how fast a
 * particular ship can change its mind: a gunboat's is four times a
 * dreadnought's, so a controller gain expressed in raw rad/s would mean
 * something different on every hull in the roster.
 */
export function steadyTurnRate(spec: ShipSpec): number {
  return spec.topSpeedMs / (TURN_RADIUS_HULLS * spec.lengthM)
}

/**
 * Chosen so that at cruise, steady-state yaw rate produces a turn circle of
 * TURN_RADIUS_HULLS hull lengths. Calibration, not balance.
 */
export function rudderGain(spec: ShipSpec): number {
  const v = spec.topSpeedMs
  const targetOmega = steadyTurnRate(spec)
  const k = angularDragCoefficient(spec)
  // steady state: gain * v = LINEAR_DRAG_FRACTION*k*w + k*w^2
  return (LINEAR_DRAG_FRACTION * k * targetOmega + k * targetOmega * targetOmega) / v
}

/** Rotational inertia of a uniform rectangular hull about its centre. */
export function momentOfInertia(spec: ShipSpec): number {
  return (spec.massKg * (spec.lengthM ** 2 + spec.beamM ** 2)) / 12
}

function angularDragCoefficient(spec: ShipSpec): number {
  return momentOfInertia(spec) * ANGULAR_DRAG_FACTOR
}

/** Everything the hull feels this tick, in the hull frame. */
export function hullForces(
  throttle: number,
  rudder: number,
  vForward: number,
  vLateral: number,
  omega: number,
  spec: ShipSpec,
): HullForces {
  const drag = hullDrag(vForward, vLateral, spec)
  return {
    forward: thrustForce(throttle, spec) + drag.forward,
    lateral: drag.lateral,
    torque: rudderTorque(rudder, vForward, spec) + angularDrag(omega, spec),
  }
}

// ---------------------------------------------------------------------------
// The roster. Derived from config so the live sliders actually reach the sim —
// a module constant baked from DEFAULTS would make topSpeedMs and hullHp dead
// knobs, which is the exact dead-field class this project keeps catching.
// ---------------------------------------------------------------------------

/** Thrust that produces the spec top speed in the spec time, against spec drag. */
export function thrustNewtons(spec: ShipSpec): number {
  return (accelTimeConstant() * spec.massKg * spec.topSpeedMs) / spec.timeToTopSpeedSec
}

/** Forward drag coefficient such that thrust == drag at top speed. */
export function forwardDragCoefficient(spec: ShipSpec): number {
  const t = thrustNewtons(spec)
  const v = spec.topSpeedMs
  return t / (v * v * (1 + LINEAR_DRAG_FRACTION))
}

/**
 * Time constant relating thrust to `timeToTopSpeedSec`.
 *
 * ⚠️ The obvious constant is `atanh(0.95) = 1.832` and it is WRONG here — that
 * is the closed form for PURE QUADRATIC drag. With a linear term as well,
 * `m dv/dt = b(vt - v)(v + (1+f)vt)`, which integrates to the expression below.
 * At f = 1.2 it gives 2.306, so using 1.832 made every hull take 26% longer to
 * reach speed than its spec said. Derived rather than hard-coded so it tracks
 * LINEAR_DRAG_FRACTION — that coupling is exactly what a literal broke.
 */
function accelTimeConstant(): number {
  const f = LINEAR_DRAG_FRACTION
  return ((1 + f) / (2 + f)) * Math.log((0.95 + 1 + f) / ((1 + f) * 0.05))
}

export function gunboatSpec(topSpeedMs: number, hullHp: number): ShipSpec {
  return {
    cls: 'gunboat',
    lengthM: 0.25,
    beamM: 0.05,
    massKg: 0.4,
    topSpeedMs,
    timeToTopSpeedSec: 1.6,
    gunRangeM: 1.2,
    hp: hullHp,
    armor: 0,
  }
}

/**
 * ⚠️ Rescaled, deliberately. The prototype's dreadnought is calibrated against
 * a 0.95 m/s gunboat; dropped in unchanged beside a 0.50 m/s one it would be
 * the FASTEST ship in the pool, inverting the whole point of it. Speed scales
 * by the same ratio the gunboat took (x0.526); HP keeps the prototype's 6.7x.
 */
export function dreadnoughtSpec(topSpeedMs: number, hullHp: number): ShipSpec {
  return {
    cls: 'dreadnought',
    lengthM: 0.6,
    beamM: 0.12,
    massKg: 3.8,
    topSpeedMs: topSpeedMs * 0.58,
    timeToTopSpeedSec: 4.0,
    gunRangeM: 1.8,
    hp: hullHp * 3.3,
    armor: 0.5,
  }
}

/** The default gunboat, for tests and for anything that needs a reference hull. */
export const GUNBOAT: ShipSpec = gunboatSpec(DEFAULTS.topSpeedMs, DEFAULTS.hullHp)
