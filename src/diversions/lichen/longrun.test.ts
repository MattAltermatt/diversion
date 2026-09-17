import { describe, expect, it } from 'vitest'
import { lichenSchema } from './schema'
import { createWorld, stepWorld, worldCoverage } from './world'

const DY = 40 / 60 / 60

/**
 * The load-bearing test: does the piece still have a second act after the first ninety
 * seconds? This is what the rejected moving-waterline design failed.
 *
 * ⚠️ An earlier draft asserted "coverage drops below 60% at some point". Measured across
 * eight seeds, THREE never do — and `seed` randomises on a fresh visit, so that gate would
 * have described a lucky rock rather than the design, and pinning a seed would have hidden
 * it rather than fixed it. The four properties below hold on every seed measured.
 *
 * Sizes and budget: run at 125x80 for 4.8s. The same four properties were verified at the
 * nominal 250x160 arena with wider margins (max coverage 100%, biggest storm 46.2%, min
 * 50-year churn 5.9%, species swing 15.4pt) — this is the cheap version of that, not a
 * different claim. CI is slower than local and this repo has no global testTimeout.
 */
describe('the long run', () => {
  it('keeps changing for centuries', { timeout: 60_000 }, () => {
    const world = createWorld(125, 80, lichenSchema.parse({ seed: 1 }))
    let nextYear = 1
    let maxCoverage = 0
    let biggestStorm = 0
    const churn: number[] = []
    const shares: number[][] = []
    let prev = Int8Array.from(world.colony.occ)

    while (world.simYears < 420) {
      const running = world.storm
      stepWorld(world, DY)
      if (running && !world.storm) {
        biggestStorm = Math.max(biggestStorm, running.stripped / world.colony.occ.length * 100)
      }
      if (world.simYears < nextYear) continue
      nextYear++
      maxCoverage = Math.max(maxCoverage, worldCoverage(world) * 100)
      let changed = 0
      for (let i = 0; i < prev.length; i++) if (prev[i] !== world.colony.occ[i]) changed++
      churn.push(changed / prev.length * 100)
      prev = Int8Array.from(world.colony.occ)
      const per = new Array(5).fill(0)
      for (const v of world.colony.occ) if (v !== -1) per[v]++
      shares.push(per.map(v => v / world.colony.occ.length * 100))
    }

    // 1. It does fill the cliff. Measured 99.8%.
    expect(maxCoverage).toBeGreaterThan(90)

    // 2. It never goes permanently static. This is the real second-act property, and the
    //    one that is robust across seeds. Measured worst 50-year window: 16.9% total churn.
    let worstWindow = Infinity
    for (let i = 0; i + 50 <= churn.length; i++) {
      worstWindow = Math.min(worstWindow, churn.slice(i, i + 50).reduce((a, b) => a + b, 0))
    }
    expect(worstWindow).toBeGreaterThan(1)

    // 3. Storms are consequential, not a scratch. Measured biggest: 40.4% of the grid.
    expect(biggestStorm).toBeGreaterThan(10)

    // 4. Territory genuinely changes hands — shares are not frozen. Measured swing 15.7pt.
    const settled = shares.slice(60)
    const swing = Math.max(...[0, 1, 2, 3, 4].map(k => {
      const col = settled.map(r => r[k])
      return Math.max(...col) - Math.min(...col)
    }))
    expect(swing).toBeGreaterThan(3)
  })
})
