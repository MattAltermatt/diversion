// The escalation rule. This is the piece's one novel mechanic and everything
// else serves it.
//
//   Open 3 v 3. On EVERY sinking one replacement enters, flying the current
//   new faction. The current new faction advances every `sideSize` arrivals.
//
// So every faction gets exactly `sideSize` hulls and is never reinforced
// again, which makes the population a conserved quantity and the piece a
// ROLLING WINDOW: old colours go extinct from the left while new ones enter
// from the right, forever.
//
// ⚠️ The population invariant is the keystone. Nothing else in the design
// fails loudly if it breaks — the pool would just drain or flood over ten
// minutes and look slightly odd. Test it directly, at length, across seeds.

import type { PoolNavyConfig } from './config'
import { dreadnoughtSpec, gunboatSpec } from './hull'
import { initialState } from './integrator'
import type { Ship } from './ship'
import { isDreadnought } from './ship'
import { WEAPONS, weaponFor } from './weapons'

export interface Fleet {
  ships: Ship[]
  /** Cumulative sinkings. Drives the faction schedule. */
  deathCount: number
  nextId: number
}

/**
 * Which faction supplies the replacement for the Nth sinking.
 *
 * Deaths 1..sideSize bring faction 2, the next `sideSize` bring faction 3, and
 * so on without limit. Factions 0 and 1 are the opening sides and are never
 * reinforced.
 */
export function factionForDeath(deathIndex: number, sideSize: number): number {
  return 2 + Math.floor((deathIndex - 1) / sideSize)
}

/**
 * At most ONE dreadnought afloat.
 *
 * ⚠️ A per-arrival probability cannot express "occasionally" when lifetimes
 * differ: by Little's law the standing count is arrival rate x mean lifetime,
 * and a dreadnought is by design long-lived. Worse, the feedback is positive —
 * more dreadnoughts means fewer sinkings means fewer arrivals, so the
 * escalation rule slows toward a stop. A standing cap is stable by
 * construction rather than by tuning.
 */
export const MAX_DREADNOUGHTS = 1

export function makeShip(
  id: string, factionIndex: number, cfg: PoolNavyConfig,
  heavy: boolean, x: number, y: number, heading: number,
): Ship {
  const spec = heavy
    ? dreadnoughtSpec(cfg.topSpeedMs, cfg.hullHp)
    : gunboatSpec(cfg.topSpeedMs, cfg.hullHp)
  return {
    id,
    faction: String(factionIndex),
    factionIndex,
    spec,
    weapon: heavy ? WEAPONS.heavy : weaponFor(id),
    hp: spec.hp,
    alive: true,
    hull: initialState({ x, y, heading }),
    turretBearing: 0,
    reload: 0,
    captain: null,
    prevHeadingError: undefined,
    stalledFor: 0,
    trail: [],
  }
}

function perimeterPoint(cfg: PoolNavyConfig, inset: number, u: number): { x: number; y: number } {
  const w = cfg.poolWidthM - inset * 2
  const h = cfg.poolHeightM - inset * 2
  let d = u * 2 * (w + h)
  if (d < w) return { x: inset + d, y: inset }
  d -= w
  if (d < h) return { x: cfg.poolWidthM - inset, y: inset + d }
  d -= h
  if (d < w) return { x: cfg.poolWidthM - inset - d, y: cfg.poolHeightM - inset }
  d -= w
  return { x: inset, y: cfg.poolHeightM - inset - d }
}

/**
 * Where a fresh faction steams in from: the perimeter point farthest from
 * every living hull, so a new colour arrives out of open water rather than
 * materialising inside the brawl.
 */
export function spawnPose(
  ships: readonly Ship[], cfg: PoolNavyConfig, phase: number,
): { x: number; y: number; heading: number } {
  const inset = 0.5
  const cx = cfg.poolWidthM / 2
  const cy = cfg.poolHeightM / 2
  let best = { x: inset, y: cy, heading: 0 }
  let bestD = -1
  for (let i = 0; i < 12; i++) {
    const p = perimeterPoint(cfg, inset, (i / 12 + phase) % 1)
    let d = Infinity
    for (const s of ships) {
      if (!s.alive) continue
      d = Math.min(d, Math.hypot(s.hull.x - p.x, s.hull.y - p.y))
    }
    if (d > bestD) {
      bestD = d
      best = { ...p, heading: Math.atan2(cy - p.y, cx - p.x) }
    }
  }
  return best
}

export function openingFleet(cfg: PoolNavyConfig, rnd: () => number): Fleet {
  const fleet: Fleet = { ships: [], deathCount: 0, nextId: 0 }
  for (let i = 0; i < cfg.sideSize; i++) {
    const y = (cfg.poolHeightM * (i + 1)) / (cfg.sideSize + 1)
    fleet.ships.push(
      makeShip(`f0-${fleet.nextId++}`, 0, cfg, false, cfg.poolWidthM * 0.12, y, (rnd() - 0.5) * 0.6),
    )
    fleet.ships.push(
      makeShip(`f1-${fleet.nextId++}`, 1, cfg, false, cfg.poolWidthM * 0.88, y, Math.PI + (rnd() - 0.5) * 0.6),
    )
  }
  return fleet
}

/** One sinking: the victim leaves, one hull of the current new faction enters. */
export function onSinking(fleet: Fleet, victim: Ship, cfg: PoolNavyConfig, rnd: () => number): void {
  const i = fleet.ships.indexOf(victim)
  if (i >= 0) fleet.ships.splice(i, 1)

  fleet.deathCount++
  const faction = factionForDeath(fleet.deathCount, cfg.sideSize)
  const afloatHeavies = fleet.ships.filter(isDreadnought).length
  const heavy = afloatHeavies < MAX_DREADNOUGHTS && rnd() < cfg.dreadnoughtChance
  const pose = spawnPose(fleet.ships, cfg, rnd())
  fleet.ships.push(
    makeShip(`f${faction}-${fleet.nextId++}`, faction, cfg, heavy, pose.x, pose.y, pose.heading),
  )
}

export function liveFactions(ships: readonly Ship[]): number[] {
  return [...new Set(ships.filter((s) => s.alive).map((s) => s.factionIndex))].sort((a, b) => a - b)
}
