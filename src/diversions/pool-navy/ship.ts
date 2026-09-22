// The record every later module mutates.
//
// ⚠️ It lives here rather than beside the constants because it needs ShipSpec,
// WeaponSpec, HullState and CaptainState — all of which arrive in earlier
// modules. Declaring it next to the config would forward-reference four types
// and fail `tsc` while still passing vitest, which strips types.

import type { CaptainState } from './captain'
import type { ShipSpec } from './hull'
import type { HullState } from './integrator'
import type { WeaponSpec } from './weapons'

export interface Ship {
  readonly id: string
  /**
   * Carried in BOTH forms on purpose: a string for the ported captain's
   * equality checks, an index for the escalation schedule and the palette.
   */
  readonly faction: string
  readonly factionIndex: number
  spec: ShipSpec
  weapon: WeaponSpec
  hp: number
  alive: boolean
  hull: HullState
  /** Hull-relative, radians. */
  turretBearing: number
  /** Seconds until the mount can fire again. */
  reload: number
  captain: CaptainState | null
  prevHeadingError: number | undefined
  /** Seconds below the way threshold. A pinned hull cannot steer. */
  stalledFor: number
  /** Wake samples in metres, written by sim.ts and read by render.ts. */
  trail: Array<{ x: number; y: number }>
}

/** Is this hull a dreadnought? By its SPEC's class, never by reference. */
export function isDreadnought(s: Ship): boolean {
  return s.spec.cls === 'dreadnought'
}

/** Where the turret sits along the hull, as a fraction of half-length. */
export const MOUNT_ALONG = 0.25
/** Barrel length, as a multiple of beam. Matches the drawn stub. */
export const BARREL_BEAMS = 1.26

/**
 * The muzzle: the tip of the barrel, in world metres.
 *
 * ⚠️ ONE definition, because there were two and they disagreed. Shells left
 * from the turret MOUNT while the laser left from the hull CENTRE, so the beam
 * visibly emerged from the middle of the boat. Neither accounted for the
 * barrel, and neither rotated with the turret — which is the thing a viewer is
 * watching, since the turret traverse is the whole mechanic.
 */
export function muzzleOf(s: Ship): { x: number; y: number; angle: number } {
  const along = MOUNT_ALONG * s.spec.lengthM * 0.5
  const mx = s.hull.x + along * Math.cos(s.hull.heading)
  const my = s.hull.y + along * Math.sin(s.hull.heading)
  const angle = s.hull.heading + s.turretBearing
  const barrel = s.spec.beamM * BARREL_BEAMS
  return { x: mx + Math.cos(angle) * barrel, y: my + Math.sin(angle) * barrel, angle }
}
