import { describe, it, expect } from 'vitest'
import {
  seedWorld, speciesCounts, packParams, packView, arenaDims, REP_DIST, GENOME, type ParamCfg,
} from './pack'
import { recipeByName, RECIPES, PARAM_MAX, PRIMORDIAL_SOUP } from './recipes'

const jelly = recipeByName('Jelly Fish')

const paramCfg: ParamCfg = {
  count: 1234, seed: 99, collisionRadius: 14, mutationRate: 0.14,
  simThreshold: 0.08, competition: 'Majority', evolve: true,
}

describe('speciesCounts', () => {
  it('distributes by weight and sums exactly to count', () => {
    for (const r of RECIPES) {
      const weights = r.species.map((s) => s.weight)
      for (const count of [300, 1000, 3001, 10000]) {
        const cs = speciesCounts(weights, count)
        expect(cs.reduce((s, x) => s + x, 0)).toBe(count)
      }
    }
  })
})

describe('seedWorld (per-particle genomes)', () => {
  it('is deterministic for a seed and diverges for another', () => {
    const a = seedWorld('Jelly Fish', 500, 42, 600, 400)
    const b = seedWorld('Jelly Fish', 500, 42, 600, 400)
    const c = seedWorld('Jelly Fish', 500, 43, 600, 400)
    expect(a.pos).toEqual(b.pos)
    expect(a.genome).toEqual(b.genome)
    expect(a.pos).not.toEqual(c.pos)
  })

  it('places particles in the arena and seeds one of the recipe genomes per particle', () => {
    const w = seedWorld('Jelly Fish', 800, 7, 600, 420)
    expect(w.genome.length).toBe(800 * GENOME)
    // every particle's genome equals one of the recipe's species rows
    const rows = jelly.species.map((s) => [s.R, s.Vn, s.Vm, s.c1, s.c2, s.c3, s.c4, s.c5])
    for (let i = 0; i < 800; i++) {
      expect(w.pos[i * 2]).toBeGreaterThanOrEqual(0)
      expect(w.pos[i * 2]).toBeLessThanOrEqual(600)
      const g = Array.from(w.genome.slice(i * GENOME, i * GENOME + GENOME))
      expect(rows.some((r) => r.every((v, k) => Math.abs(v - g[k]) < 1e-4))).toBe(true)
    }
  })

  it('Primordial Soup seeds random genomes within param ranges', () => {
    const w = seedWorld(PRIMORDIAL_SOUP, 600, 3, 500, 500)
    expect(w.genome.length).toBe(600 * GENOME)
    for (let i = 0; i < 600; i++) {
      for (let k = 0; k < GENOME; k++) {
        const v = w.genome[i * GENOME + k]
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(PARAM_MAX[k])
      }
    }
    // soup should be diverse, not all one genome
    const first = Array.from(w.genome.slice(0, GENOME))
    const someDiffer = Array.from({ length: 50 }, (_, i) => i + 1)
      .some((i) => Array.from(w.genome.slice(i * GENOME, i * GENOME + GENOME)).some((v, k) => Math.abs(v - first[k]) > 1e-3))
    expect(someDiffer).toBe(true)
  })
})

describe('arenaDims', () => {
  it('keeps the short side = worldMin and matches the viewport aspect', () => {
    const land = arenaDims(600, { width: 1920, height: 1080 })
    expect(land.h).toBe(600)
    expect(land.w).toBeCloseTo(600 * (1920 / 1080))
    const port = arenaDims(600, { width: 1080, height: 1920 })
    expect(port.w).toBe(600)
    expect(port.h).toBeCloseTo(600 * (1920 / 1080))
  })
})

describe('packParams / packView byte layout', () => {
  it('packs count/arena/repDist/step/seed + evolution params at the documented offsets', () => {
    const dv = new DataView(packParams(paramCfg, 800, 600, 5))
    expect(dv.getUint32(0, true)).toBe(1234)
    expect(dv.getFloat32(4, true)).toBeCloseTo(800)
    expect(dv.getFloat32(8, true)).toBeCloseTo(600)
    expect(dv.getFloat32(12, true)).toBeCloseTo(REP_DIST)
    expect(dv.getUint32(16, true)).toBe(5)
    expect(dv.getUint32(20, true)).toBe(99)
    expect(dv.getFloat32(24, true)).toBeCloseTo(14 * 14) // collisionR²
    expect(dv.getFloat32(28, true)).toBeCloseTo(0.14)
    expect(dv.getFloat32(32, true)).toBeCloseTo(0.08) // simThreshold (raw 1-D)
    expect(dv.getUint32(36, true)).toBe(0) // Majority index
    expect(dv.getUint32(40, true)).toBe(1) // evolve
  })

  it('competition + evolve encode as expected', () => {
    const dvSlow = new DataView(packParams({ ...paramCfg, competition: 'Slower', evolve: false }, 800, 600, 0))
    expect(dvSlow.getUint32(36, true)).toBe(3)
    expect(dvSlow.getUint32(40, true)).toBe(0)
  })

  it('packView fits the arena short side to the viewport and centres it', () => {
    const dv = new DataView(packView({ dotSize: 2, colorBoost: 1.2 }, { width: 1000, height: 500 }, 1, { zoom: 1, panX: 0, panY: 0 }, 1200, 600))
    expect(dv.getFloat32(0, true)).toBeCloseTo(500 / 600)
    expect(dv.getFloat32(4, true)).toBeCloseTo(600)
    expect(dv.getFloat32(8, true)).toBeCloseTo(300)
  })
})
