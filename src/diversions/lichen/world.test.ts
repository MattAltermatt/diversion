import { describe, expect, it } from 'vitest'
import { lichenSchema } from './schema'
import { createWorld, stepWorld, worldCoverage } from './world'

const DY = 40 / 60 / 60

describe('the world clock', () => {
  it('runs one storm at a time and starts the next clock only when it finishes', () => {
    const w = createWorld(120, 77, lichenSchema.parse({ stormEvery: 2 }))
    let concurrent = 0
    for (let f = 0; f < 4000; f++) {
      stepWorld(w, DY)
      if (w.storm && w.storm.age > w.storm.duration) concurrent++
    }
    expect(concurrent).toBe(0)
    expect(w.storms).toBeGreaterThan(1)
  })

  it('advances simulated years in step with dYears', () => {
    const w = createWorld(60, 40, lichenSchema.parse({}))
    for (let f = 0; f < 100; f++) stepWorld(w, DY)
    expect(w.simYears).toBeCloseTo(100 * DY, 6)
  })

  it('is deterministic for a seed', () => {
    const run = () => {
      const w = createWorld(80, 51, lichenSchema.parse({ seed: 4 }))
      for (let f = 0; f < 600; f++) stepWorld(w, DY)
      return { occ: Array.from(w.colony.occ), storms: w.storms }
    }
    expect(run()).toEqual(run())
  })

  it('never lets storms take the cliff permanently', () => {
    const w = createWorld(120, 77, lichenSchema.parse({}))
    for (let f = 0; f < 3000; f++) stepWorld(w, DY)
    expect(worldCoverage(w)).toBeGreaterThan(0.2)
  })
})
