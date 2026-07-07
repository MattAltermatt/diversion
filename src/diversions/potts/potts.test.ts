import { describe, it, expect } from 'vitest'
import { pottsSchema, type PottsConfig } from './schema'
import {
  createPottsState, advancePotts, stepPotts, buildAccept,
  boundaryEnergy, grainCount, buildLut,
} from './potts'

const cfg = (over: Partial<PottsConfig> = {}): PottsConfig =>
  pottsSchema.parse({ ...over })

describe('schema', () => {
  it('parses with valid defaults', () => {
    const c = pottsSchema.parse({})
    expect(c.states).toBeGreaterThanOrEqual(4)
    expect(c.cellSize).toBeGreaterThanOrEqual(2)
    expect(c.temperature).toBe(0.4)
    expect(c.boundary).toBe(true)
    expect(c.palette.hueSpan).toBe(340)
  })

  it('builds one LUT colour per orientation', () => {
    expect(buildLut(cfg({ states: 12 }))).toHaveLength(12)
    expect(buildLut(cfg({ states: 40 }))).toHaveLength(40)
  })
})

describe('buildAccept', () => {
  it('always accepts energy-lowering and zero-energy moves, and rejects uphill at T→0', () => {
    const st = createPottsState(cfg({ temperature: 0 }), 40, 40)
    buildAccept(st, 0)
    expect(st.accept[-4 + 8]).toBe(1) // ΔE = -4 → always
    expect(st.accept[0 + 8]).toBe(1)  // ΔE = 0 → always (drives boundary migration)
    expect(st.accept[4 + 8]).toBeCloseTo(0, 6) // ΔE = +4 at T=0 → never
  })
})

describe('determinism', () => {
  it('same seed → identical grain evolution over N sweeps', () => {
    const a = createPottsState(cfg({ seed: 99, cellSize: 2, states: 12 }), 90, 90)
    const b = createPottsState(cfg({ seed: 99, cellSize: 2, states: 12 }), 90, 90)
    for (let s = 0; s < 25; s++) { advancePotts(a, 1); advancePotts(b, 1) }
    expect([...a.grid]).toEqual([...b.grid])
  })

  it('different seed → different evolution', () => {
    const a = createPottsState(cfg({ seed: 1, cellSize: 2, states: 12 }), 90, 90)
    const b = createPottsState(cfg({ seed: 2, cellSize: 2, states: 12 }), 90, 90)
    for (let s = 0; s < 25; s++) { advancePotts(a, 1); advancePotts(b, 1) }
    expect([...a.grid]).not.toEqual([...b.grid])
  })
})

describe('headline: the polycrystal coarsens', () => {
  it('grain-boundary length and grain count both DECREASE over time, no NaN', () => {
    // cellSize 2 → a 60×60 lattice from a 120² pixel size, 12 orientations, low temperature
    // (near-strict energy descent) so coarsening reads cleanly.
    const st = createPottsState(cfg({ seed: 7, cellSize: 2, states: 12, temperature: 0.3 }), 120, 120)

    const energy0 = boundaryEnergy(st)
    const grains0 = grainCount(st)

    // Sweep the lattice. Grain growth is curvature-driven: small grains shrink and vanish,
    // large grains grow — so both the total boundary length and the number of distinct
    // grains fall monotonically in the long run.
    buildAccept(st, st.cfg.temperature)
    for (let s = 0; s < 80; s++) stepPotts(st)

    const energy1 = boundaryEnergy(st)
    const grains1 = grainCount(st)

    expect(Number.isNaN(energy1)).toBe(false)
    expect(Number.isNaN(grains1)).toBe(false)
    // The mosaic simplifies: fewer, longer walls → less total wall.
    expect(energy1).toBeLessThan(energy0)
    // …and fewer, bigger grains — the coarsening headline. A big drop, not a nudge.
    expect(grains1).toBeLessThan(grains0)
    expect(grains1).toBeLessThan(grains0 * 0.6)
  })

  it('never dead-ends at T=0: strict descent still reseeds (grain-count trigger)', () => {
    // #268 flagged a possible temperature=0 freeze above the grain threshold. Verified
    // false: the ΔE=0 boundary-migration moves keep coarsening until grainCount drops to
    // ≤ RESEED_GRAINS and the existing trigger re-noises — no permanent lock. (A 75-config
    // sweep found zero freezes; worst case reseeded within ~4440 sweeps.)
    const st = createPottsState(cfg({ seed: 1, cellSize: 2, states: 12, temperature: 0 }), 200, 150)
    let sweeps = 0
    for (; sweeps < 6000 && st.reseeds === 0; sweeps++) advancePotts(st, 1)
    expect(st.reseeds).toBeGreaterThan(0)
  })
})
