/** Single scalar fitness for one car's run (drives roulette + elitism unchanged).
 *
 * The "distance until reachable, then time" rule emerges from one formula: every
 * time-mode finisher scores `> goalDistance`, every non-finisher scores
 * `< goalDistance`, so finishers always outrank stragglers and — once cars start
 * finishing — selection pivots to minimizing time. No mode-switch branch needed. */
export function carFitness(opts: {
  mode: 'distance' | 'time'
  finished: boolean
  distance: number // maxX - spawnX
  goalDistance: number
  timeCap: number
  timeSec: number
}): number {
  if (opts.mode === 'time' && opts.finished) {
    return opts.goalDistance + (opts.timeCap - opts.timeSec)
  }
  return Math.max(0, opts.distance)
}
