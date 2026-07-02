/**
 * leaderboard.ts — the top-cars "hall of champions" (#225).
 *
 * A small ranked list of the best genomes seen this run, drawn as mini-car thumbnails
 * in a screen-space side panel. Pure bookkeeping: the sim calls `updateLeaderboard`
 * each time a car finishes and `drawLeaderboard` (render.ts) draws whatever's in the
 * list. Deduped by genome REFERENCE — an elite is carried into the next generation as
 * the SAME object, so it re-runs with an identical (deterministic) fitness; without
 * ref-dedup the board would fill with copies of the one champion. Track regen resets
 * the board (old fitnesses were measured on a different terrain).
 *
 * Transient by design (not persisted): a resumed run refills the board from its
 * persisted elites within one generation, so nothing here touches the save blob or
 * the rng — the determinism / persistence keystones are untouched.
 */
import type { Genome } from './genome'
import type { CarShape } from './car'

export interface Champion {
  genome: Genome
  fitness: number
  /** Pre-formatted metric shown on the card (e.g. "12.4s" or "342 m"). */
  label: string
  /** Static rest shape, precomputed once on entry (no per-frame triangulation). */
  shape: CarShape
}

/** Metric label for a finished car — finish time for a time-mode finisher, else the
 *  distance reached (both non-finishers and all of distance mode). */
export function championLabel(
  mode: 'distance' | 'time',
  finished: boolean,
  timeSec: number,
  distance: number,
): string {
  if (mode === 'time' && finished) return `${timeSec.toFixed(1)}s`
  return `${Math.round(distance)} m`
}

/** Fold one finished car into the board: dedup by genome reference (keep the higher
 *  fitness — normally identical), re-sort fitness-descending, cap at `capacity`.
 *  Pure — returns a new array, never mutates the input. */
export function updateLeaderboard(
  board: Champion[],
  entry: Champion,
  capacity: number,
): Champion[] {
  const existing = board.findIndex((c) => c.genome === entry.genome)
  const next =
    existing >= 0
      ? board.map((c, i) => (i === existing && entry.fitness >= c.fitness ? entry : c))
      : [...board, entry]
  next.sort((a, b) => b.fitness - a.fitness)
  return next.slice(0, capacity)
}
