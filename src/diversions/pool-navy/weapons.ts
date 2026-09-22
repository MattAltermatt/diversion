// The mounts. One flat record per kind — every field present on every kind,
// because a discriminated union gave the missile no lifetime (the field that
// lets it miss) and left the torpedo no way to say it hits bystanders.
//
// ⚠️ Bearing is HULL-RELATIVE throughout, and that is the whole mechanic.
// Tracking in world space would be simpler and would quietly delete the
// design: yawing the ship must swing every turret's bearing and force
// re-acquisition, because that is what makes manoeuvring and shooting trade
// against each other. If a world bearing is ever stored here, the mechanic is
// gone.

import { BEARING_TOLERANCE_DEG } from './config'
import { wrapAngle } from './helm'

export type WeaponKind =
  | 'cannon' | 'laser' | 'missile' | 'torpedo'
  | 'flak' | 'railgun' | 'mortar' | 'depthCharge'
  | 'heavy'

export interface WeaponSpec {
  readonly kind: WeaponKind
  readonly traverseDegPerSec: number
  readonly rangeM: number
  /** Shots per second. Unused by `laser`, which is continuous. */
  readonly rateOfFirePerSec: number
  /** Per shell for the discrete mounts; per SECOND for `laser`. */
  readonly damage: number
  /** Projectile speed, m/s. `laser` has none. */
  readonly speedMs: number
  /** Degrees per second the PROJECTILE can turn. 0 = unguided. */
  readonly turnRateDegPerSec: number
  /** Seconds a projectile lives. 0 = resolves at fire time. */
  readonly lifeSec: number
  /** Does it hit whatever it meets, including its own side? */
  readonly hitsAnyone: boolean
}

const DEG = Math.PI / 180

export const WEAPONS: Record<WeaponKind, WeaponSpec> = {
  // The measured baseline. At 45 deg/s a turret with a chance to fire is on
  // bearing 62.9% of the time — not ~100% — which is what makes traverse an
  // axis the other mounts can differ along.
  cannon: {
    kind: 'cannon', traverseDegPerSec: 45, rangeM: 1.2, rateOfFirePerSec: 1.5,
    damage: 2.5, speedMs: 28, turnRateDegPerSec: 0, lifeSec: 0, hitsAnyone: false,
  },
  // A mirror, not a gun mount: it tracks easily but must HOLD bearing, so
  // breaking lock is the counter rather than out-running the traverse.
  laser: {
    kind: 'laser', traverseDegPerSec: 95, rangeM: 1.0, rateOfFirePerSec: 0,
    damage: 2.6, speedMs: 0, turnRateDegPerSec: 0, lifeSec: 0, hitsAnyone: false,
  },
  // Guided, so it does NOT hit bystanders — chasing a specific hull is the
  // whole point of it, and hitting anyone would take the torpedo's identity.
  // ⚠️ 25 deg/s, NOT 60. A missile is out-turnable only when its own turn
  // radius exceeds a hull's 0.75 m. At 60 the radius is 1.15 m and it misses
  // 0.8% of the time — the guidance axis does not exist. At 25 the radius is
  // 2.75 m and it misses 11.7% in the mixed roster.
  missile: {
    kind: 'missile', traverseDegPerSec: 12, rangeM: 2.2, rateOfFirePerSec: 0.5,
    damage: 6, speedMs: 1.2, turnRateDegPerSec: 25, lifeSec: 6, hitsAnyone: false,
  },
  // Straight, slow, long-lived, and it hits WHOEVER it meets. The only mount
  // that can turn a two-ship duel into something the whole pool has a view on.
  torpedo: {
    kind: 'torpedo', traverseDegPerSec: 20, rangeM: 2.5, rateOfFirePerSec: 0.35,
    damage: 8, speedMs: 0.9, turnRateDegPerSec: 0, lifeSec: 3.2, hitsAnyone: true,
  },
  // Knife-fighter. Very short reach, a fast-slewing mount and a high rate of
  // fire — it out-tracks anything that closes, and is useless past arm's
  // length. The counter to a gunboat that tries to cross close aboard.
  flak: {
    kind: 'flak', traverseDegPerSec: 130, rangeM: 0.55, rateOfFirePerSec: 5,
    damage: 1.0, speedMs: 26, turnRateDegPerSec: 0, lifeSec: 0, hitsAnyone: false,
  },
  // The sniper. Glacial mount, enormous reach, one heavy hit on a long cycle.
  // It cannot defend itself at all, so it lives or dies on whether the pool
  // is crowded — which makes it the mount most sensitive to pool size.
  railgun: {
    kind: 'railgun', traverseDegPerSec: 7, rangeM: 3.4, rateOfFirePerSec: 0.22,
    damage: 22, speedMs: 60, turnRateDegPerSec: 0, lifeSec: 0, hitsAnyone: false,
  },
  // Lobbed, so it ignores bearing almost entirely — a wide firing tolerance
  // mount that arcs a shell onto wherever the target WAS. Slow enough to be
  // dodged by anything under way, which makes it lethal to a limping hull and
  // nearly harmless to a healthy one.
  mortar: {
    kind: 'mortar', traverseDegPerSec: 60, rangeM: 1.7, rateOfFirePerSec: 0.55,
    damage: 9, speedMs: 1.6, turnRateDegPerSec: 0, lifeSec: 1.25, hitsAnyone: true,
  },
  // Area denial: rolled off the stern, drifts, and detonates on whoever comes
  // near — most often the ship that laid it, if it lingers. The only mount
  // whose ammunition is still dangerous long after the engagement moved on.
  depthCharge: {
    kind: 'depthCharge', traverseDegPerSec: 180, rangeM: 0.9, rateOfFirePerSec: 0.3,
    damage: 12, speedMs: 0.18, turnRateDegPerSec: 0, lifeSec: 9, hitsAnyone: true,
  },
  // The dreadnought's main battery, and NOT one of the rollable mounts.
  // It exists so §4.2's thesis is true of something the sim reads: it needs
  // 15.9 deg/s to hold a 0.5 m/s gunboat at its own 1.8 m range, and has 9.
  // So it deletes what it can hit and mostly cannot hit a gunboat.
  heavy: {
    kind: 'heavy', traverseDegPerSec: 9, rangeM: 1.8, rateOfFirePerSec: 0.3,
    damage: 15, speedMs: 28, turnRateDegPerSec: 0, lifeSec: 0, hitsAnyone: false,
  },
}

/**
 * What a GUNBOAT may roll. The heavy mount is the dreadnought's alone.
 *
 * Eight mounts rather than four, because the roll is the content: with four,
 * repetition is visible within a couple of minutes. Each owns a different
 * axis — reach, traverse, guidance, rate, friendly fire, or persistence —
 * rather than being a damage number with a different name.
 */
export const ROLLABLE: readonly WeaponKind[] = [
  'cannon', 'laser', 'missile', 'torpedo', 'flak', 'railgun', 'mortar', 'depthCharge',
]

/**
 * Which mount a hull carries, from its id.
 *
 * Deterministic and NOT `Math.random()` — one unseeded call anywhere makes a
 * seeded replay impossible.
 *
 * ⚠️ The second avalanche is load-bearing. The raw FNV low bits of "f3-7"-style
 * ids correlate hard with the trailing digit: without it every trailing digit
 * collapses to exactly TWO kinds in a perfect 4-cycle, so weapon tracks spawn
 * order. A test asserting "more than one kind per digit" cannot see that,
 * because two is more than one.
 */
export function weaponFor(id: string, allowed: readonly WeaponKind[] = ROLLABLE): WeaponSpec {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  return WEAPONS[allowed[(h >>> 0) % allowed.length]!]!
}

interface Point { readonly x: number; readonly y: number }

/**
 * Where the turret would point if it could snap there instantly, in the HULL
 * frame. Subtracting the hull heading is the entire manoeuvre-vs-shoot
 * tradeoff: yaw the ship and this moves, against a target that has not stirred.
 */
export function desiredBearing(hullHeadingRad: number, shooter: Point, target: Point): number {
  return wrapAngle(Math.atan2(target.y - shooter.y, target.x - shooter.x) - hullHeadingRad)
}

export function bearingError(
  currentBearingRad: number, hullHeadingRad: number, shooter: Point, target: Point,
): number {
  return wrapAngle(desiredBearing(hullHeadingRad, shooter, target) - currentBearingRad)
}

/** Advance a turret one step toward its target, limited by its rated traverse. */
export function trackTurret(
  currentBearingRad: number, hullHeadingRad: number, shooter: Point, target: Point,
  traverseDegPerSec: number, dt: number,
): number {
  const error = bearingError(currentBearingRad, hullHeadingRad, shooter, target)
  const maxSlew = traverseDegPerSec * DEG * dt
  return wrapAngle(currentBearingRad + Math.max(-maxSlew, Math.min(maxSlew, error)))
}

/**
 * Whether the guns bear closely enough to fire.
 *
 * This tolerance IS the accuracy model — no spread roll, no hit chance, no
 * randomness, so a seed replays exactly. A turret that has fallen behind a
 * crossing target simply does not shoot. Measured: sweeping it from 0.5 to 10
 * degrees moves the kill rate within noise, so it is not a tuning lever.
 */
export function onBearing(
  currentBearingRad: number, hullHeadingRad: number, shooter: Point, target: Point,
): boolean {
  return Math.abs(bearingError(currentBearingRad, hullHeadingRad, shooter, target))
    <= BEARING_TOLERANCE_DEG * DEG
}
