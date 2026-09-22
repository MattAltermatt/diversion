// The naive captain.
//
// Naive BY DIRECTIVE, not by omission. It finds the nearest enemy, chases it,
// and kills it. It does not lead a target, kite, shoot the healer first, break
// off when it is losing, or coordinate with anyone. Those absences are the
// content: a captain doing something stupid is a thing to watch, and making it
// clever needs a new decision issue rather than a patch here.
//
// What it is NOT allowed to be is incompetent at the wheel. The dumbness lives
// in target selection; `helm` drives, and the standoff arc below is helmsmanship
// too — how you approach, not who you approach.
//
// Every tick it emits a whole CaptainState, including a sentence saying why.
// The debug inspector reads exactly this struct and nothing else (decision #5),
// so a decision that cannot be named at the moment it is made is a decision
// this file is not allowed to take.
//
// Pure logic — no Phaser, no Box2D.

import {
  STANDOFF_ENGAGE_FRACTION,
  STANDOFF_FRACTION,
  TARGET_SWITCH_HYSTERESIS,
} from './config'
import { avoidWalls, helm, wrapAngle, type Pool } from './helm'
import type { ShipSpec } from './hull'
import type { HullState } from './integrator'

export type CaptainIntent = 'closing' | 'engaging' | 'idle'

/**
 * Emitted every tick. Everything downstream reads THIS — never a parallel
 * re-scan. Two independent selections of "the target" is how a debug readout
 * ends up naming one ship while the damage goes to another.
 */
export interface CaptainState {
  targetId: string | null
  whyThisTarget: string
  intent: CaptainIntent
  desiredHeadingRad: number
  throttle: number
  rudder: number
}

/**
 * What one captain can see of one ship, itself included.
 *
 * Position is carried here rather than read from a body so that the whole AI
 * stays testable in node: the binding copies the transform in once a tick and
 * this file never learns that Box2D exists.
 */
export interface ShipView {
  readonly id: string
  readonly faction: string
  readonly spec: ShipSpec
  readonly x: number
  readonly y: number
  readonly hp: number
}

export interface CaptainInput {
  readonly self: ShipView
  /** Own hull, for the helm. Its heading is the one the rudder answers to. */
  readonly hull: HullState
  /** Everything afloat, including `self`. Dead ships may still be in here. */
  readonly world: readonly ShipView[]
  /** Last tick's `captain.targetId`. Drives the switch hysteresis. */
  readonly prevTargetId?: string | null
  /** Last tick's `headingError`. Feeds the helm's derivative term. */
  readonly prevHeadingError?: number
  /** For the wall avoidance, which is helmsmanship and lives in helm.ts. */
  readonly pool: Pool
}

export interface CaptainDecision {
  readonly captain: CaptainState
  /** Pass back as `prevHeadingError` next tick. */
  readonly headingError: number
}

export function isAlive(ship: ShipView): boolean {
  return ship.hp > 0
}

function distance(a: ShipView, b: ShipView): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function metres(m: number): string {
  return `${m.toFixed(2)} m`
}

/**
 * Which way round the target this ship arcs, decided by its id.
 *
 * It has to be decided by *something*, and it must not be `Math.random()` —
 * the seeded replay (#23) is impossible the moment one tick consults an
 * unseeded source. An id hash gives a stable answer that survives a reload and
 * still splits a pack of attackers to both sides of their target instead of
 * stacking them all on one.
 */
export function arcSign(id: string): 1 | -1 {
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 31) === 0 ? 1 : -1
}

interface Choice {
  readonly ship: ShipView
  readonly distanceM: number
  readonly why: string
}

/**
 * Nearest living enemy, with enough hysteresis not to dither.
 *
 * Pure nearest-enemy is the directive, but pure nearest-enemy *every tick* is
 * worse than naive, it is broken: two enemies a centimetre apart in range make
 * the ship swap targets every tick, chase the midpoint, and never close on
 * either. Holding the current target until something is meaningfully nearer
 * keeps the behaviour dumb while letting it actually finish a kill. It also
 * gives re-acquisition for free — a dead target is simply no longer a
 * candidate.
 */
function pickTarget(
  self: ShipView,
  world: readonly ShipView[],
  prevTargetId: string | null,
): Choice | null {
  const enemies = world.filter((s) => s.id !== self.id && s.faction !== self.faction && isAlive(s))
  if (enemies.length === 0) return null

  let nearest = enemies[0]!
  let nearestD = distance(self, nearest)
  for (const e of enemies) {
    const d = distance(self, e)
    if (d < nearestD) {
      nearest = e
      nearestD = d
    }
  }

  const held = prevTargetId === null ? undefined : enemies.find((e) => e.id === prevTargetId)
  if (held !== undefined && held.id !== nearest.id) {
    const heldD = distance(self, held)
    if (nearestD > heldD * (1 - TARGET_SWITCH_HYSTERESIS)) {
      return {
        ship: held,
        distanceM: heldD,
        why: `still on target, ${metres(heldD)} — nothing meaningfully nearer`,
      }
    }
  }

  return { ship: nearest, distanceM: nearestD, why: `nearest enemy, ${metres(nearestD)}` }
}

/**
 * Where to steer to hold station off a target instead of ramming it.
 *
 * Pure pursuit points the bow straight at the enemy, and closing straight down
 * the line of sight is radial motion — which has essentially zero bearing rate.
 * A ship that does that is the easiest possible target: every turret in the
 * fight tracks it for free and the traverse limit, which is the entire evasion
 * mechanic, never binds. Steering to a tangent of the standoff circle keeps the
 * range roughly constant and the bearing rate high, and it is why ships arc
 * around each other rather than meeting bow to bow in the middle of the pool.
 *
 * Geometry: from a point at distance d outside a circle of radius r, the
 * tangent line leaves at asin(r / d) off the line to the centre, and touches
 * the circle sqrt(d^2 - r^2) further on. Inside the circle there is no tangent,
 * so steer square across the line of sight — that opens the range and hands
 * back the tangent case within a second or two.
 */
function standoffCourse(
  self: ShipView,
  target: ShipView,
  distanceM: number,
): { heading: number; waypoint: { x: number; y: number } } {
  const radius = STANDOFF_FRACTION * self.spec.gunRangeM
  const bearing = Math.atan2(target.y - self.y, target.x - self.x)
  const outside = distanceM > radius

  const offset = outside ? Math.asin(radius / distanceM) : Math.PI / 2
  const heading = wrapAngle(bearing + arcSign(self.id) * offset)
  const lead = outside ? Math.sqrt(distanceM * distanceM - radius * radius) : radius

  return {
    heading,
    waypoint: { x: self.x + lead * Math.cos(heading), y: self.y + lead * Math.sin(heading) },
  }
}

/** One tick of captaincy: decide, then hand the wheel to the helmsman. */
export function captainTick(input: CaptainInput): CaptainDecision {
  const { self, hull, world } = input
  const prevTargetId = input.prevTargetId ?? null

  const choice = pickTarget(self, world, prevTargetId)

  if (choice === null) {
    // Nothing to do and nothing to say about it. Engines stopped rather than
    // steaming somewhere arbitrary — an idle ship that keeps driving reads as
    // a bug, and the match is over anyway.
    return {
      captain: {
        targetId: null,
        whyThisTarget: 'no enemy afloat',
        intent: 'idle',
        desiredHeadingRad: hull.heading,
        throttle: 0,
        rudder: 0,
        },
      headingError: 0,
    }
  }

  const inStandoff = choice.distanceM <= STANDOFF_ENGAGE_FRACTION * self.spec.gunRangeM

  const course = inStandoff
    ? standoffCourse(self, choice.ship, choice.distanceM)
    : {
        heading: Math.atan2(choice.ship.y - self.y, choice.ship.x - self.x),
        waypoint: { x: choice.ship.x, y: choice.ship.y },
      }

  // Wall avoidance bends the ORDER before the helm answers it. It is
  // helmsmanship (how you drive), not captaincy (who you attack) — the same
  // split the standoff arc already sits on.
  const bent = avoidWalls(course.heading, hull, input.pool, self.spec)
  const { controls, error } =
    input.prevHeadingError === undefined
      ? helm(hull, bent, self.spec)
      : helm(hull, bent, self.spec, input.prevHeadingError)

  return {
    captain: {
      targetId: choice.ship.id,
      whyThisTarget: choice.why,
      intent: inStandoff ? 'engaging' : 'closing',
      desiredHeadingRad: bent,
      throttle: controls.throttle,
      rudder: controls.rudder,
    },
    headingError: error,
  }
}
