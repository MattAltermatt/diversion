// The tick orchestrator. Everything that advances time lives here and NOT in index.ts's
// `frame`, so the long-run test drives exactly the code that ships. Putting the storm
// clock and the year accumulation inside `frame` would force the test to re-implement
// them, and its "disabling storms must fail this" mutation would then be testing the
// test's own loop.

import { type Colony, coverage, makeColony, prime, step } from './colony'
import { makeRng } from './noise'
import { buildRock, computeSterile, computeWet, type Rock } from './rock'
import type { LichenConfig } from './schema'
import { beginStorm, drawSeverity, pickKind, stepStorm, type Storm } from './storm'

export interface World {
  rock: Rock
  colony: Colony
  rnd: () => number
  simYears: number
  nextStorm: number
  storm: Storm | null
  storms: number
  cfg: LichenConfig
}

export function createWorld(cols: number, rows: number, cfg: LichenConfig): World {
  const rock = buildRock(cols, rows, cfg.seed)
  computeWet(rock, cfg.exposure, cfg.relief)
  computeSterile(rock, cfg.bareRock, cfg.veinStyle)
  const colony = makeColony(cols * rows)
  const rnd = makeRng(cfg.seed)
  prime(colony, rock, rnd)
  return { rock, colony, rnd, simYears: 0, nextStorm: 6, storm: null, storms: 0, cfg }
}

/** Advance the world by `dYears`. A running storm scrubs; only when it finishes does the
 *  clock for the next one start. */
export function stepWorld(world: World, dYears: number): void {
  const { colony, rock, cfg, rnd } = world
  step(colony, rock, { sporeRate: cfg.sporeRate }, dYears, rnd)
  world.simYears += dYears

  if (world.storm) {
    if (!stepStorm(world.storm, colony, dYears)) world.storm = null
  } else if (world.simYears >= world.nextStorm) {
    world.storm = beginStorm(pickKind(cfg.whimsy, rnd), drawSeverity(rnd), rock, rnd)
    world.storms++
    // Irregular spacing so it never reads as a metronome. Mean multiplier 1.15.
    world.nextStorm = world.simYears + cfg.stormEvery * (0.45 + rnd() * 1.4)
  }
}

export const worldCoverage = (world: World): number => coverage(world.colony, world.rock)
