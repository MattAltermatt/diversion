// Droplet physics — pure, canvas-free, so it's directly unit-testable. Mass
// drives radius area-conservingly (r = sqrt(mass) * scale): a static bead
// condenses (mass grows) until it crosses slideThreshold, then breaks loose and
// slides down, absorbing any smaller bead it overlaps (mass += absorbed mass).

import type { RainOnGlassConfig } from './schema'

export interface Drop {
  x: number
  y: number
  prevY: number // last-frame y (sliding only) — used to draw the wet-trail segment
  r: number
  mass: number
  sliding: boolean
  vy: number
  wobblePhase: number
  wobbleSeed: number
}

const RADIUS_SCALE = 6 // px per sqrt(mass) unit — area-conserving growth/merge
const CONDENSE_RATE = 0.5 // mass/sec at condensation slider = 1
const GRAVITY = 260 // px/s^2 baseline downward accel once sliding
const WOBBLE_FREQ = 2.4 // rad/s
const WOBBLE_AMP = 8 // px/s of lateral wobble at full amplitude
const SPAWN_MASS_MIN = 0.04
const SPAWN_MASS_MAX = 0.22

export function radiusFromMass(mass: number): number {
  return Math.sqrt(Math.max(0, mass)) * RADIUS_SCALE
}

/** Terminal-ish velocity cap, scaled with size like a real drop (bigger drops
 *  outrun drag more) so heavy runnels visibly outpace small ones. */
function vMaxFor(mass: number): number {
  return 60 + Math.sqrt(mass) * 90
}

export function createDrop(rng: () => number, w: number, h: number, yRange?: [number, number]): Drop {
  const mass = SPAWN_MASS_MIN + rng() * (SPAWN_MASS_MAX - SPAWN_MASS_MIN)
  const [y0, y1] = yRange ?? [0, h]
  const y = y0 + rng() * (y1 - y0)
  return {
    x: rng() * w,
    y,
    prevY: y,
    r: radiusFromMass(mass),
    mass,
    sliding: false,
    vy: 0,
    wobblePhase: rng() * Math.PI * 2,
    wobbleSeed: rng(),
  }
}

export function spawnInitialDrops(
  cfg: RainOnGlassConfig,
  w: number,
  h: number,
  rng: () => number,
): Drop[] {
  return Array.from({ length: cfg.density }, () => createDrop(rng, w, h))
}

/** Advance one drop: condensation growth while static, then (once past
 *  slideThreshold) gravity + wobble while sliding. The mass-threshold check
 *  and the gravity integration happen in the SAME call — a drop that's
 *  already above `slideThreshold` starts moving the instant it's stepped,
 *  no one-frame lag. `dt` is milliseconds (framework convention). */
export function stepDrop(d: Drop, cfg: RainOnGlassConfig, dt: number): Drop {
  const dtSec = dt / 1000
  if (!d.sliding) {
    d.mass += cfg.condensation * CONDENSE_RATE * dtSec
    if (d.mass >= cfg.slideThreshold) {
      d.sliding = true
      d.vy = 0
    }
  }
  if (d.sliding) {
    d.prevY = d.y
    d.vy = Math.min(d.vy + GRAVITY * dtSec, vMaxFor(d.mass))
    d.wobblePhase += dtSec * WOBBLE_FREQ
    d.x += Math.sin(d.wobblePhase + d.wobbleSeed * 7) * WOBBLE_AMP * dtSec
    d.y += d.vy * dtSec
  }
  d.r = radiusFromMass(d.mass)
  return d
}

/** Sliding drops absorb any smaller drop (static or sliding) they overlap,
 *  picking up its mass — the runnel-picks-up-droplets behavior. Returns a new
 *  array with absorbed drops removed. O(n^2); fine at this diversion's
 *  population sizes (a few hundred) — #253's spatial-hash watch-out only
 *  matters past that. */
export function absorbOverlaps(drops: Drop[]): Drop[] {
  const absorbed = new Set<Drop>()
  for (const a of drops) {
    if (!a.sliding || absorbed.has(a)) continue
    for (const b of drops) {
      if (a === b || absorbed.has(b) || b.mass >= a.mass) continue
      const dx = a.x - b.x, dy = a.y - b.y
      const rr = a.r + b.r * 0.9 // require real overlap, not just edge-touch
      if (dx * dx + dy * dy <= rr * rr) {
        a.mass += b.mass
        a.r = radiusFromMass(a.mass)
        absorbed.add(b)
      }
    }
  }
  return absorbed.size === 0 ? drops : drops.filter((d) => !absorbed.has(d))
}
