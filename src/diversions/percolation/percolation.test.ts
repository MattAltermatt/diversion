import { describe, it, expect } from 'vitest'
import { createState, advance, labelState, applyConfig, P_C, type PercolationState } from './percolation'
import { percolationSchema, type PercolationConfig } from './schema'

const cfg = (over: Partial<PercolationConfig> = {}): PercolationConfig =>
  percolationSchema.parse({ ...over })

/** Build a labelled state at a fixed density p over the seeded landscape. */
function atDensity(seed: number, p: number, w = 720, h = 480): PercolationState {
  const s = createState(cfg({ seed, sweepMode: 'manual', p }), w, h)
  return s // createState already labels at p
}

/** Any NaN in the numeric outputs? */
function hasNaN(s: PercolationState): boolean {
  return [s.p, s.clusterCount, s.largestSize, s.spanCount].some((v) => Number.isNaN(v))
}

describe('percolation schema', () => {
  it('parses with valid defaults', () => {
    const c = percolationSchema.parse({})
    expect(c.cellSize).toBe(8)
    expect(c.sweepMode).toBe('sweep')
    expect(c.colorMode).toBe('cluster')
    expect(c.palette.length).toBeGreaterThanOrEqual(2)
    expect(c.pMin).toBeLessThan(c.pMax)
  })
})

describe('percolation determinism', () => {
  it('same seed + p → identical clusters', () => {
    const a = atDensity(42, 0.6)
    const b = atDensity(42, 0.6)
    expect(Array.from(a.open)).toEqual(Array.from(b.open))
    expect(Array.from(a.root)).toEqual(Array.from(b.root))
    expect(a.clusterCount).toBe(b.clusterCount)
    expect(a.spanCount).toBe(b.spanCount)
  })
  it('different seed → different landscape', () => {
    const a = atDensity(1, 0.6)
    const b = atDensity(2, 0.6)
    expect(Array.from(a.open)).not.toEqual(Array.from(b.open))
  })
  it('a full sweep is reproducible from the seed', () => {
    const run = (seed: number) => {
      const s = createState(cfg({ seed, sweepMode: 'sweep' }), 480, 320)
      for (let i = 0; i < 200; i++) advance(s, 16)
      return s
    }
    const a = run(9), b = run(9)
    expect(a.p).toBeCloseTo(b.p, 10)
    expect(Array.from(a.root)).toEqual(Array.from(b.root))
  })
})

describe('percolation labelling — known small grids', () => {
  // Build an 8×8 grid (the min the framework allows), open only the listed sites
  // (thresh 0 = open, 1 = closed), and label at p = 0.5.
  const grid8 = (opens: [number, number][]): PercolationState => {
    const s = createState(cfg({ cellSize: 16, sweepMode: 'manual', p: 0.5 }), 128, 128)
    expect(s.gw).toBe(8)
    expect(s.gh).toBe(8)
    s.thresh.fill(1) // all closed
    for (const [gx, gy] of opens) s.thresh[gy * s.gw + gx] = 0
    labelState(s)
    return s
  }

  it('a connected plus is ONE cluster', () => {
    const s = grid8([[3, 3], [2, 3], [4, 3], [3, 2], [3, 4]])
    expect(s.clusterCount).toBe(1)
    expect(s.largestSize).toBe(5)
  })

  it('diagonal-only touching sites are SEPARATE (4-connectivity)', () => {
    const s = grid8([[1, 1], [2, 2], [3, 3]])
    expect(s.clusterCount).toBe(3) // no 4-neighbour links across the diagonal
    expect(s.largestSize).toBe(1)
  })

  it('two separated open cells are two clusters', () => {
    const s = grid8([[1, 1], [3, 1]]) // gap at (2,1)
    expect(s.clusterCount).toBe(2)
  })

  it('a full column spans top↔bottom; a partial one does not', () => {
    const spanning = grid8([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7]])
    expect(spanning.spanCount).toBe(8)

    const partial = grid8([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]]) // stops at row 6
    expect(partial.spanCount).toBe(0)
  })
})

describe('percolation phase transition (HEADLINE)', () => {
  // The real test: below p_c there is NO top↔bottom spanning cluster, above p_c there IS.
  const seeds = [1, 7, 23, 99]
  it(`no spanning cluster well below p_c (${P_C})`, () => {
    for (const seed of seeds) {
      const s = atDensity(seed, 0.45) // comfortably subcritical
      expect(s.spanCount).toBe(0)
    }
  })
  it('a spanning cluster exists well above p_c', () => {
    for (const seed of seeds) {
      const s = atDensity(seed, 0.75) // comfortably supercritical
      expect(s.spanCount).toBeGreaterThan(0)
    }
  })
  it('the spanning cluster is (near) the largest cluster above p_c', () => {
    const s = atDensity(7, 0.75)
    // supercritical: the giant IS the spanning cluster
    expect(s.spanCount).toBe(s.largestSize)
  })
  it('no NaN across a sweep through criticality', () => {
    const s = createState(cfg({ seed: 3, sweepMode: 'sweep' }), 480, 320)
    for (let i = 0; i < 300; i++) { advance(s, 20); expect(hasNaN(s)).toBe(false) }
  })
})

describe('percolation applyConfig', () => {
  it('applies a colour edit live', () => {
    const s = atDensity(5, 0.6)
    expect(applyConfig(s, cfg({ seed: 5, sweepMode: 'manual', p: 0.6, colorMode: 'size' }))).toBe(true)
    expect(s.cfg.colorMode).toBe('size')
  })
  it('rejects a structural edit (cell size / seed) for a full re-setup', () => {
    const s = atDensity(5, 0.6)
    expect(applyConfig(s, cfg({ seed: 5, sweepMode: 'manual', p: 0.6, cellSize: 12 }))).toBe(false)
    expect(applyConfig(s, cfg({ seed: 6, sweepMode: 'manual', p: 0.6 }))).toBe(false)
  })
  it('a manual density edit relabels immediately', () => {
    const s = atDensity(5, 0.45)
    const before = s.spanCount
    applyConfig(s, cfg({ seed: 5, sweepMode: 'manual', p: 0.78 }))
    expect(s.p).toBeCloseTo(0.78, 10)
    expect(s.spanCount).toBeGreaterThan(before)
  })
})
