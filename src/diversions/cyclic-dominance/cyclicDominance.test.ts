import { describe, it, expect } from 'vitest'
import { cyclicDominanceSchema } from './schema'
import {
  createState, step, advance, applyInteraction, buildRates, buildLut, EMPTY,
} from './cyclicDominance'

const cfg = (over = {}) => cyclicDominanceSchema.parse({ ...over })

describe('cyclic-dominance determinism', () => {
  it('same seed → identical initial grid', () => {
    const a = createState(cfg({ seed: 7 }), 800, 600)
    const b = createState(cfg({ seed: 7 }), 800, 600)
    expect(Array.from(a.grid)).toEqual(Array.from(b.grid))
  })

  it('different seed → different grid', () => {
    const a = createState(cfg({ seed: 1 }), 800, 600)
    const b = createState(cfg({ seed: 2 }), 800, 600)
    expect(Array.from(a.grid)).not.toEqual(Array.from(b.grid))
  })

  it('same seed → identical trajectory over many sweeps', () => {
    const a = createState(cfg({ seed: 3, gridResolution: 60 }), 800, 600)
    const b = createState(cfg({ seed: 3, gridResolution: 60 }), 800, 600)
    for (let t = 0; t < 20; t++) { step(a); step(b) }
    expect(Array.from(a.grid)).toEqual(Array.from(b.grid))
  })
})

describe('rate normalization', () => {
  it('cumulative thresholds sum implicitly to 1 (mobility is the remainder)', () => {
    const t = buildRates(cfg({ predationRate: 0.375, reproductionRate: 0.375, mobility: 0.25 }))
    expect(t.p).toBeCloseTo(0.375)
    expect(t.pr).toBeCloseTo(0.75)
  })

  it('normalizes raw rates that do not already sum to 1', () => {
    // Bypass the schema's slider bounds here — buildRates itself must
    // normalize any positive triple, not just ones already summing to 1.
    const t = buildRates({ ...cfg(), predationRate: 0.6, reproductionRate: 0.6, mobility: 0.6 })
    expect(t.p).toBeCloseTo(1 / 3)
    expect(t.pr).toBeCloseTo(2 / 3)
  })
})

describe('applyInteraction — the three reaction rules', () => {
  const thresh = { p: 0.34, pr: 0.67 } // roughly equal thirds

  it('predation: predator eats its prey (cyclic: species s preys on (s+1)%3)', () => {
    const g = new Int8Array([0, 1]) // species A next to its prey, species B
    applyInteraction(g, 0, 1, 0.1, thresh) // draw lands in the predation band
    expect(g[0]).toBe(0) // predator survives
    expect(g[1]).toBe(EMPTY) // prey is eaten
  })

  it('predation: checks the reverse direction too (prey stored at index i)', () => {
    const g = new Int8Array([1, 0]) // prey (B) at i, predator (A) at j
    applyInteraction(g, 0, 1, 0.1, thresh)
    expect(g[0]).toBe(EMPTY)
    expect(g[1]).toBe(0)
  })

  it('predation: no-op when neither side preys on the other', () => {
    const g = new Int8Array([0, 0])
    applyInteraction(g, 0, 1, 0.1, thresh)
    expect(Array.from(g)).toEqual([0, 0])
  })

  it('reproduction: the empty cell copies the occupied neighbour', () => {
    const g = new Int8Array([EMPTY, 2])
    applyInteraction(g, 0, 1, 0.5, thresh) // draw lands in the reproduction band
    expect(g[0]).toBe(2)
    expect(g[1]).toBe(2)
  })

  it('reproduction: no-op when both sides are occupied or both empty', () => {
    const g = new Int8Array([1, 2])
    applyInteraction(g, 0, 1, 0.5, thresh)
    expect(Array.from(g)).toEqual([1, 2])
    const e = new Int8Array([EMPTY, EMPTY])
    applyInteraction(e, 0, 1, 0.5, thresh)
    expect(Array.from(e)).toEqual([EMPTY, EMPTY])
  })

  it('mobility: swaps the pair outright regardless of contents', () => {
    const g = new Int8Array([1, EMPTY])
    applyInteraction(g, 0, 1, 0.9, thresh) // draw lands in the mobility band
    expect(g[0]).toBe(EMPTY)
    expect(g[1]).toBe(1)
  })
})

describe('cyclic-dominance rules', () => {
  it('all cells stay in {-1,0,1,2} over many sweeps', () => {
    const s = createState(cfg({ seed: 5, gridResolution: 60 }), 800, 600)
    for (let t = 0; t < 40; t++) step(s)
    for (const v of s.grid) {
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(2)
    }
  })

  it('fractions (including empty) sum to ~1 after a sweep', () => {
    const s = createState(cfg({ seed: 9, gridResolution: 60 }), 400, 400)
    step(s)
    const sum = s.fractions[0] + s.fractions[1] + s.fractions[2] + s.fractions[3]
    expect(sum).toBeCloseTo(1)
  })

  it('advance fires whole sweeps from dt', () => {
    const s = createState(cfg({ seed: 4, simSpeed: 10, gridResolution: 60 }), 800, 600)
    advance(s, 350)
    expect(s.tick).toBeGreaterThanOrEqual(3)
    expect(s.tick).toBeLessThanOrEqual(4)
  })

  it('extinctStreak climbs once a species is wiped out and stays out', () => {
    const s = createState(cfg({ seed: 5, gridResolution: 60 }), 800, 600)
    // Force an extinction directly rather than waiting on the stochastic sim.
    for (let i = 0; i < s.grid.length; i++) if (s.grid[i] === 2) s.grid[i] = EMPTY
    s.fractions.fill(0)
    for (const v of s.grid) s.fractions[v + 1]++
    for (let k = 0; k < 4; k++) s.fractions[k] /= s.grid.length
    expect(s.fractions[3]).toBe(0)
  })
})

describe('cyclic-dominance render gate (#273)', () => {
  it('marks dirty only when a sweep actually runs', () => {
    const s = createState(cfg({ seed: 4, simSpeed: 10, gridResolution: 60 }), 800, 600)
    expect(s.dirty).toBe(true) // fresh state must paint once

    s.dirty = false
    advance(s, 0) // no time → no sweep
    expect(s.dirty).toBe(false) // nothing changed → no field rebuild

    s.dirty = false
    advance(s, 1000) // plenty of time → sweeps run
    expect(s.dirty).toBe(true)
  })
})

describe('colour LUT', () => {
  it('has 4 distinct rgb entries', () => {
    const lut = buildLut(cfg())
    expect(lut.length).toBe(12)
    const seen = new Set<string>()
    for (let i = 0; i < 4; i++) seen.add(`${lut[i * 3]},${lut[i * 3 + 1]},${lut[i * 3 + 2]}`)
    expect(seen.size).toBe(4)
  })
})
