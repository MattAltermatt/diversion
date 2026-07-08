import { describe, it, expect } from 'vitest'
import { voterSchema, type VoterConfig } from './schema'
import {
  createVoterState, advanceVoter, stepVoter, minorityCount, buildLut, setNeighborhood,
} from './voter'

const cfg = (over: Partial<VoterConfig> = {}): VoterConfig =>
  voterSchema.parse({ ...over })

describe('schema', () => {
  it('parses with valid defaults', () => {
    const c = voterSchema.parse({})
    expect(c.palette.length).toBeGreaterThanOrEqual(3)
    expect(c.cellSize).toBeGreaterThanOrEqual(2)
    expect(c.noiseRate).toBe(0)
    expect(c.neighborhood).toBe('moore')
  })

  it('builds one LUT colour per opinion (palette length = k)', () => {
    expect(buildLut(cfg({ palette: ['#ff0000', '#00ff00', '#0000ff'] }))).toHaveLength(3)
    expect(buildLut(cfg({ palette: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'] }))).toHaveLength(5)
  })
})

describe('determinism', () => {
  it('same seed → identical initial lattice', () => {
    const a = createVoterState(cfg({ seed: 99, cellSize: 2 }), 90, 90)
    const b = createVoterState(cfg({ seed: 99, cellSize: 2 }), 90, 90)
    expect([...a.grid]).toEqual([...b.grid])
  })

  it('same seed → identical evolution over N sweeps', () => {
    const a = createVoterState(cfg({ seed: 99, cellSize: 2 }), 90, 90)
    const b = createVoterState(cfg({ seed: 99, cellSize: 2 }), 90, 90)
    for (let s = 0; s < 25; s++) { advanceVoter(a, 1); advanceVoter(b, 1) }
    expect([...a.grid]).toEqual([...b.grid])
  })

  it('different seed → different initial lattice', () => {
    const a = createVoterState(cfg({ seed: 1, cellSize: 2 }), 90, 90)
    const b = createVoterState(cfg({ seed: 2, cellSize: 2 }), 90, 90)
    expect([...a.grid]).not.toEqual([...b.grid])
  })
})

describe('the imitation rule', () => {
  it('a cell adopts one of its neighbours\' opinions each attempt (never an outside value)', () => {
    // A 2-opinion, tiny lattice: after any number of sweeps every cell's value must still
    // be a value that existed somewhere on the lattice at start (imitation never invents
    // a new opinion — with noiseRate 0 the only source of a cell's value is a neighbour).
    const st = createVoterState(cfg({ seed: 5, cellSize: 2, palette: ['#ff0000', '#00ff00', '#0000ff'] }), 40, 40)
    const startingOpinions = new Set(st.grid)
    for (let s = 0; s < 30; s++) stepVoter(st)
    for (const v of st.grid) expect(startingOpinions.has(v)).toBe(true)
  })

  it('consensus (all cells one opinion) is absorbing without noise', () => {
    const st = createVoterState(cfg({ seed: 3, cellSize: 4, palette: ['#ff0000', '#00ff00', '#0000ff'] }), 16, 16)
    st.grid.fill(1) // force full consensus on opinion 1
    for (let s = 0; s < 20; s++) stepVoter(st)
    for (const v of st.grid) expect(v).toBe(1)
  })

  it('honors the active neighbourhood size (von Neumann=4 vs Moore=8 offsets)', () => {
    const st = createVoterState(cfg({ seed: 1, cellSize: 2 }), 40, 40)
    expect(st.nbCount).toBe(8) // default 'moore'
    setNeighborhood(st, 'vonNeumann')
    expect(st.nbCount).toBe(4)
    setNeighborhood(st, 'moore')
    expect(st.nbCount).toBe(8)
  })
})

describe('headline: the field coarsens', () => {
  it('minority count trends toward 0 as domains merge', () => {
    // cellSize 2 → a 60x60 lattice from a 120px size, low opinion count so coarsening
    // reads cleanly and completes within a modest sweep budget.
    const st = createVoterState(cfg({ seed: 7, cellSize: 2, palette: ['#ff0000', '#00ff00', '#0000ff'] }), 120, 120)
    const minority0 = minorityCount(st)
    for (let s = 0; s < 400; s++) stepVoter(st)
    const minority1 = minorityCount(st)
    expect(Number.isNaN(minority1)).toBe(false)
    expect(minority1).toBeLessThan(minority0)
  })

  it('never dead-ends: reseeds once the field drifts to (near) consensus', () => {
    const st = createVoterState(cfg({ seed: 1, cellSize: 3, palette: ['#ff0000', '#00ff00', '#0000ff'] }), 90, 60)
    let sweeps = 0
    for (; sweeps < 4000 && st.reseeds === 0; sweeps++) advanceVoter(st, 1)
    expect(st.reseeds).toBeGreaterThan(0)
    // Right after a reseed the field is freshly randomized — far from consensus again.
    expect(minorityCount(st)).toBeGreaterThan(RESEED_MINORITY_SANITY)
  })

  it('with Independence > 0 the field keeps a minority alive (does not need to reseed)', () => {
    const st = createVoterState(cfg({ seed: 2, cellSize: 3, palette: ['#ff0000', '#00ff00', '#0000ff'], noiseRate: 0.02 }), 90, 60)
    for (let s = 0; s < 2000; s++) advanceVoter(st, 1)
    // A meaningful independence rate should keep multiple opinions represented.
    expect(minorityCount(st)).toBeGreaterThan(0)
  })
})

// Loose sanity bound mirroring the reseed trigger's own threshold, used only to assert
// "freshly reseeded" is meaningfully far from "about to reseed" — not a tight coupling.
const RESEED_MINORITY_SANITY = 20
