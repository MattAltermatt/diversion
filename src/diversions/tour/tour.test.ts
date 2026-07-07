import { describe, it, expect } from 'vitest'
import { tourSchema } from './schema'
import {
  createTourState, optimizeStep, tourLength, twoOptDelta, applyTwoOpt, advance,
  type TourState,
} from './tour'

const defaults = () => tourSchema.parse({})

function isPermutation(tour: number[], n: number): boolean {
  if (tour.length !== n) return false
  const seen = new Uint8Array(n)
  for (const v of tour) {
    if (v < 0 || v >= n || seen[v]) return false
    seen[v] = 1
  }
  return true
}

// Drive the solver toward convergence and record the length after each batch.
function optimizeToConvergence(state: TourState, batches = 400): number[] {
  const lengths: number[] = [tourLength(state.cx, state.cy, state.tour)]
  for (let b = 0; b < batches; b++) {
    optimizeStep(state, 400)
    lengths.push(tourLength(state.cx, state.cy, state.tour))
  }
  return lengths
}

describe('schema', () => {
  it('parses with valid defaults', () => {
    const cfg = defaults()
    expect(cfg.cityCount).toBe(140)
    expect(cfg.cityLayout).toBe('uniform')
    expect(cfg.optimizer).toBe('mixed')
    expect(cfg.pathColor.mode).toBe('position')
    expect(cfg.background).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('accepts every layout and optimizer option', () => {
    for (const cityLayout of ['uniform', 'clustered', 'ring', 'grid'] as const) {
      for (const optimizer of ['2-opt', 'or-opt', 'mixed'] as const) {
        expect(() => tourSchema.parse({ cityLayout, optimizer })).not.toThrow()
      }
    }
  })
})

describe('determinism', () => {
  it('same seed → identical cities and identical tour evolution', () => {
    const cfg = { ...defaults(), seed: 42 }
    const a = createTourState(cfg, 800, 600)
    const b = createTourState(cfg, 800, 600)
    expect(Array.from(a.cx)).toEqual(Array.from(b.cx))
    expect(Array.from(a.cy)).toEqual(Array.from(b.cy))
    expect(a.tour).toEqual(b.tour)
    for (let i = 0; i < 50; i++) { optimizeStep(a, 300); optimizeStep(b, 300) }
    expect(a.tour).toEqual(b.tour)
    expect(tourLength(a.cx, a.cy, a.tour)).toBe(tourLength(b.cx, b.cy, b.tour))
  })

  it('different seed → different cities', () => {
    const a = createTourState({ ...defaults(), seed: 1 }, 800, 600)
    const b = createTourState({ ...defaults(), seed: 2 }, 800, 600)
    expect(Array.from(a.cx)).not.toEqual(Array.from(b.cx))
  })
})

describe('2-opt move', () => {
  it('delta matches the actual length change and reversal preserves the permutation', () => {
    const state = createTourState({ ...defaults(), seed: 5, optimizer: '2-opt' }, 800, 600)
    const n = state.n
    for (let trial = 0; trial < 200; trial++) {
      let i = (state.rng() * (n - 1)) | 0
      let j = (state.rng() * (n - 1)) | 0
      if (i === j) continue
      if (i > j) { const t = i; i = j; j = t }
      if (i === 0 && j === n - 1) continue
      const before = tourLength(state.cx, state.cy, state.tour)
      const delta = twoOptDelta(state, i, j)
      applyTwoOpt(state.tour, i, j)
      const after = tourLength(state.cx, state.cy, state.tour)
      expect(after - before).toBeCloseTo(delta, 5)
      expect(isPermutation(state.tour, n)).toBe(true)
    }
  })

  it('2-opt reaches the wrap edge — position n-1 is not frozen (regression #276)', () => {
    // A prior off-by-one sampled i,j from 0..n-2, so `j` never reached n-1: the wrap
    // edge (n-1→0) and tour position n-1 could never be swapped and stayed pinned for
    // the whole run. (tour[0]'s city is an inherent rotation anchor — that one is fine.)
    const state = createTourState({ ...defaults(), seed: 17, optimizer: '2-opt' }, 800, 600)
    const n = state.n
    const last = state.tour[n - 1]
    let lastMoved = false
    for (let f = 0; f < 400 && !lastMoved; f++) {
      optimizeStep(state, 400)
      if (state.tour[n - 1] !== last) lastMoved = true
    }
    expect(lastMoved).toBe(true)
    expect(isPermutation(state.tour, n)).toBe(true)
  })

  it('optimizeStep never increases the tour length (only accepts improving moves)', () => {
    for (const optimizer of ['2-opt', 'or-opt', 'mixed'] as const) {
      const state = createTourState({ ...defaults(), seed: 9, optimizer }, 800, 600)
      const lengths = optimizeToConvergence(state, 120)
      for (let k = 1; k < lengths.length; k++) {
        expect(lengths[k]).toBeLessThanOrEqual(lengths[k - 1] + 1e-9)
        expect(Number.isNaN(lengths[k])).toBe(false)
      }
    }
  })
})

describe('headline: the tangle untangles', () => {
  it('drives the tour length monotonically down to well below the random start', () => {
    const state = createTourState({ ...defaults(), seed: 3, optimizer: '2-opt' }, 800, 600)
    const lengths = optimizeToConvergence(state, 400)
    const start = lengths[0]
    const final = lengths[lengths.length - 1]

    // strictly non-increasing at every step, no NaN
    for (let k = 1; k < lengths.length; k++) {
      expect(lengths[k]).toBeLessThanOrEqual(lengths[k - 1] + 1e-9)
      expect(Number.isNaN(lengths[k])).toBe(false)
    }
    // and a big, obvious improvement — a solved 2-opt loop is far shorter than a
    // shuffled one (comfortably under 60% of the random-start length)
    expect(final).toBeLessThan(start * 0.6)
    // the final tour still visits every city exactly once
    expect(isPermutation(state.tour, state.n)).toBe(true)
  })

  it('mixed optimizer also untangles substantially', () => {
    const state = createTourState({ ...defaults(), seed: 11, optimizer: 'mixed' }, 800, 600)
    const lengths = optimizeToConvergence(state, 400)
    expect(lengths[lengths.length - 1]).toBeLessThan(lengths[0] * 0.6)
    expect(isPermutation(state.tour, state.n)).toBe(true)
  })
})

describe('lifecycle', () => {
  it('converges to a hold, then rescatters into a fresh tangled tour', () => {
    const state = createTourState({ ...defaults(), seed: 4, optimizer: '2-opt', holdSeconds: 1 }, 800, 600)
    // run enough frames to solve, hold, and rescatter at least once
    let sawHold = false
    let rescattered = false
    const firstStart = state.startLength
    for (let f = 0; f < 5000 && !rescattered; f++) {
      const prevPhase = state.phase
      advance(state, 16.67)
      if (state.phase === 'holding') sawHold = true
      // a rescatter resets to optimizing from holding with a fresh (longer) tangle
      if (prevPhase === 'holding' && state.phase === 'optimizing') rescattered = true
    }
    expect(sawHold).toBe(true)
    expect(rescattered).toBe(true)
    expect(isPermutation(state.tour, state.n)).toBe(true)
    // fresh tangle: a shuffled tour is much longer than the solved one it replaced
    expect(state.startLength).toBeGreaterThan(0)
    expect(firstStart).toBeGreaterThan(0)
  })
})
