import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../framework/rng'
import { DEFAULTS } from './config'
import { isDreadnought } from './ship'
import { factionForDeath, liveFactions, onSinking, openingFleet, spawnPose } from './fleet'

describe('the escalation rule', () => {
  it('every faction gets exactly sideSize hulls, and never more', () => {
    const counts = new Map<number, number>()
    for (let d = 1; d <= 300; d++) {
      const f = factionForDeath(d, 3)
      counts.set(f, (counts.get(f) ?? 0) + 1)
    }
    for (const [faction, n] of counts) expect(n, `faction ${faction}`).toBe(3)
  })

  it('deaths 1-3 bring faction 2 and death 4 brings faction 3', () => {
    expect([1, 2, 3].map((d) => factionForDeath(d, 3))).toEqual([2, 2, 2])
    expect(factionForDeath(4, 3)).toBe(3)
  })

  it('the schedule never skips or repeats a faction', () => {
    const seen = [...new Set(Array.from({ length: 300 }, (_, i) => factionForDeath(i + 1, 3)))]
    for (let i = 1; i < seen.length; i++) expect(seen[i]! - seen[i - 1]!).toBe(1)
  })

  it('tracks sideSize rather than hard-coding three', () => {
    expect(factionForDeath(5, 5)).toBe(2)
    expect(factionForDeath(6, 5)).toBe(3)
  })

  // ⭐ THE KEYSTONE. This is the property that makes the piece endless, and
  // nothing else in the design fails loudly if it breaks.
  it('POPULATION IS CONSERVED across a long run, on every seed', () => {
    for (let s = 0; s < 8; s++) {
      const rnd = mulberry32(1000 + s)
      const fleet = openingFleet(DEFAULTS, rnd)
      expect(fleet.ships.length).toBe(DEFAULTS.sideSize * 2)
      for (let d = 0; d < 400; d++) {
        onSinking(fleet, fleet.ships[d % fleet.ships.length]!, DEFAULTS, rnd)
        expect(fleet.ships.length, `seed ${s} after death ${d + 1}`).toBe(DEFAULTS.sideSize * 2)
      }
    }
  })

  it('the victim actually leaves — no duplicate ids accumulate', () => {
    const rnd = mulberry32(4)
    const fleet = openingFleet(DEFAULTS, rnd)
    for (let d = 0; d < 200; d++) onSinking(fleet, fleet.ships[d % fleet.ships.length]!, DEFAULTS, rnd)
    expect(new Set(fleet.ships.map((s) => s.id)).size).toBe(fleet.ships.length)
  })

  it('opens as two sides of three', () => {
    expect(liveFactions(openingFleet(DEFAULTS, mulberry32(7)).ships)).toEqual([0, 1])
  })

  // §4.2.1 — "occasionally" is about the POOL, not about arrivals.
  // ⚠️ Identified by spec CLASS, never by reference: specs are built per-config
  // so `spec === DREADNOUGHT` never holds, and a cap test written that way is
  // vacuous — it passed with six dreadnoughts afloat and no cap at all.
  it('never puts two dreadnoughts in the pool at once, even at chance 1', () => {
    const cfg = { ...DEFAULTS, dreadnoughtChance: 1 }
    const rnd = mulberry32(5)
    const fleet = openingFleet(cfg, rnd)
    for (let d = 0; d < 300; d++) {
      onSinking(fleet, fleet.ships[d % fleet.ships.length]!, cfg, rnd)
      expect(fleet.ships.filter(isDreadnought).length, `after death ${d + 1}`).toBeLessThanOrEqual(1)
    }
  })

  it('...and DOES produce one when the slot is free', () => {
    const cfg = { ...DEFAULTS, dreadnoughtChance: 1 }
    const rnd = mulberry32(5)
    const fleet = openingFleet(cfg, rnd)
    onSinking(fleet, fleet.ships[0]!, cfg, rnd)
    expect(fleet.ships.filter(isDreadnought).length).toBe(1)
  })

  it('a dreadnought carries the heavy mount, a gunboat never does', () => {
    const cfg = { ...DEFAULTS, dreadnoughtChance: 1 }
    const rnd = mulberry32(9)
    const fleet = openingFleet(cfg, rnd)
    onSinking(fleet, fleet.ships[0]!, cfg, rnd)
    for (const s of fleet.ships) {
      expect(s.weapon.kind === 'heavy').toBe(isDreadnought(s))
    }
  })

  // The rule is "farthest from every living hull". Cluster the fleet on one
  // side and the arrival must appear on the other — which a "nearest point"
  // mutant inverts, and a fixed spawn point ignores.
  it('a new hull enters from open water, away from the fleet', () => {
    const cfg = DEFAULTS
    for (const [cluster, wantFar] of [[1.0, 'right'], [7.0, 'left']] as const) {
      const ships = openingFleet(cfg, mulberry32(3)).ships
      for (const s of ships) { s.hull.x = cluster; s.hull.y = 2.25 }
      let worstNear = Infinity
      for (let k = 0; k < 8; k++) {
        const pose = spawnPose(ships, cfg, k / 8)
        const near = Math.min(...ships.map((s) => Math.hypot(s.hull.x - pose.x, s.hull.y - pose.y)))
        worstNear = Math.min(worstNear, near)
        if (wantFar === 'right') expect(pose.x).toBeGreaterThan(cfg.poolWidthM / 2)
        else expect(pose.x).toBeLessThan(cfg.poolWidthM / 2)
      }
      // Never closer than half the pool width, at any phase.
      expect(worstNear).toBeGreaterThan(cfg.poolWidthM * 0.5)
    }
  })

  it('a fresh arrival points INTO the pool, not at the wall it came from', () => {
    const ships = openingFleet(DEFAULTS, mulberry32(3)).ships
    for (const s of ships) { s.hull.x = 1; s.hull.y = 2.25 }
    const pose = spawnPose(ships, DEFAULTS, 0.2)
    const toCentre = Math.atan2(2.25 - pose.y, 4 - pose.x)
    expect(Math.abs(pose.heading - toCentre)).toBeLessThan(1e-9)
  })
})
