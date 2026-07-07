import { describe, it, expect } from 'vitest'
import { redQueenSchema } from './schema'
import { createRedQueenState, step, advance, buildKernel, buildColors } from './redQueen'
import redQueen from './index'

const cfg = (over = {}) => redQueenSchema.parse({ ...over })

describe('red-queen determinism', () => {
  it('same seed → identical initial frequencies', () => {
    const a = createRedQueenState(cfg({ seed: 7 }), 800, 600)
    const b = createRedQueenState(cfg({ seed: 7 }), 800, 600)
    expect(Array.from(a.host)).toEqual(Array.from(b.host))
    expect(Array.from(a.para)).toEqual(Array.from(b.para))
  })

  it('different seed → different frequencies', () => {
    const a = createRedQueenState(cfg({ seed: 1 }), 800, 600)
    const b = createRedQueenState(cfg({ seed: 2 }), 800, 600)
    expect(Array.from(a.host)).not.toEqual(Array.from(b.host))
  })
})

describe('red-queen invariants', () => {
  it('frequencies stay normalized and non-negative over a long run', () => {
    const s = createRedQueenState(cfg({ seed: 3 }), 800, 600)
    for (let t = 0; t < 2000; t++) {
      step(s)
      let sh = 0, sp = 0
      for (let i = 0; i < s.g; i++) {
        expect(s.host[i]).toBeGreaterThanOrEqual(0)
        expect(s.para[i]).toBeGreaterThanOrEqual(0)
        sh += s.host[i]; sp += s.para[i]
      }
      expect(sh).toBeCloseTo(1, 6)
      expect(sp).toBeCloseTo(1, 6)
    }
  })

  it('mutation floor keeps every genotype alive (never fully extinct)', () => {
    const s = createRedQueenState(cfg({ seed: 4, mutationRate: 0.01 }), 800, 600)
    for (let t = 0; t < 1500; t++) step(s)
    for (let i = 0; i < s.g; i++) {
      expect(s.host[i]).toBeGreaterThan(0)
      expect(s.para[i]).toBeGreaterThan(0)
    }
  })

  it('advance fires whole generations from dt', () => {
    const s = createRedQueenState(cfg({ seed: 4, simSpeed: 20 }), 800, 600)
    advance(s, 350)
    expect(s.gen).toBeGreaterThanOrEqual(6)
    expect(s.gen).toBeLessThanOrEqual(8)
  })
})

describe('red-queen actually oscillates (feasibility)', () => {
  // The whole point of the piece: after transients, the frequencies must keep
  // SWINGING, not damp to the uniform fixed point (1/g each). We measure the
  // temporal variance of the dominant host genotype's frequency across a window.
  it('the dominant-genotype frequency keeps a wide swing (does not converge)', () => {
    const s = createRedQueenState(cfg({ seed: 3, virulence: 1.4, parasiteSelection: 1.6 }), 800, 600)
    for (let t = 0; t < 300; t++) step(s) // burn transients
    let min = Infinity, max = -Infinity
    let sum = 0, sum2 = 0, count = 0
    for (let t = 0; t < 1200; t++) {
      step(s)
      // track the max host frequency each generation — a proxy for "how peaked"
      let peak = 0
      for (let i = 0; i < s.g; i++) if (s.host[i] > peak) peak = s.host[i]
      min = Math.min(min, peak); max = Math.max(max, peak)
      sum += peak; sum2 += peak * peak; count++
    }
    const variance = sum2 / count - (sum / count) ** 2
    // A converged system would have variance ≈ 0 and min≈max. Demand a real swing.
    expect(max - min).toBeGreaterThan(0.1)
    expect(variance).toBeGreaterThan(1e-4)
  })
})

describe('kernel + colours', () => {
  it('matchBreadth 0 → only exact matches infect', () => {
    const k = buildKernel(cfg({ genotypeCount: 8, matchBreadth: 0 }))
    const g = 8
    for (let p = 0; p < g; p++)
      for (let h = 0; h < g; h++)
        expect(k[p * g + h]).toBe(p === h ? 1 : 0)
  })

  it('matchBreadth wraps around the genotype ring', () => {
    const k = buildKernel(cfg({ genotypeCount: 8, matchBreadth: 1 }))
    const g = 8
    // genotype 0 should also infect genotype 7 (ring neighbour).
    expect(k[0 * g + 7]).toBe(1)
    expect(k[0 * g + 1]).toBe(1)
    expect(k[0 * g + 2]).toBe(0)
  })

  it('builds one rgb per genotype', () => {
    const c = buildColors(cfg({ genotypeCount: 8 }))
    expect(c.length).toBe(8 * 3)
  })
})

describe('matchBreadth applies live, not as a full re-setup (#270)', () => {
  // update() rebuilds the kernel live (state.kernel = buildKernel(config)) on every
  // non-structural edit, so a matchBreadth change can apply WITHOUT wiping the whole
  // waterfall. It must therefore return true and swap in the new-breadth kernel.
  it('changing only matchBreadth returns true and rebuilds the kernel', () => {
    const s = createRedQueenState(cfg({ genotypeCount: 8, matchBreadth: 0 }), 800, 600)
    const before = Array.from(s.kernel)
    const applied = redQueen.update!(s, cfg({ genotypeCount: 8, matchBreadth: 3 }), { width: 800, height: 600 })
    expect(applied).toBe(true)
    expect(Array.from(s.kernel)).toEqual(Array.from(buildKernel(cfg({ genotypeCount: 8, matchBreadth: 3 }))))
    expect(Array.from(s.kernel)).not.toEqual(before)
  })

  it('changing genotypeCount is still structural (returns false → full re-setup)', () => {
    const s = createRedQueenState(cfg({ genotypeCount: 8 }), 800, 600)
    const applied = redQueen.update!(s, cfg({ genotypeCount: 12 }), { width: 800, height: 600 })
    expect(applied).toBe(false)
  })
})
