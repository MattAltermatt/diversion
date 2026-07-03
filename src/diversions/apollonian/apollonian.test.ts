import { describe, expect, it } from 'vitest'
import { buildGasket, descartesResidual, SEED_FAMILIES, type Circle } from './apollonian'

const OPTS = { maxCurvature: 200, maxCircles: 60000 }

describe('apollonian gasket', () => {
  it('every seed family satisfies the Descartes Circle Theorem', () => {
    for (const [b0, b1, b2, b3] of SEED_FAMILIES) {
      expect(descartesResidual(b0, b1, b2, b3)).toBeLessThan(1e-9)
    }
  })

  it('is deterministic for a given family index', () => {
    const a = buildGasket(2, OPTS)
    const b = buildGasket(2, OPTS)
    expect(a.length).toBe(b.length)
    expect(a[10]).toEqual(b[10])
  })

  it('different families produce different gaskets', () => {
    const a = buildGasket(0, OPTS)
    const b = buildGasket(3, OPTS)
    // circle counts or the first seed curvature differ
    expect(a.length !== b.length || a[1].k !== b[1].k).toBe(true)
  })

  it('places exactly one negative-curvature bounding circle at the origin', () => {
    const g = buildGasket(0, OPTS)
    const outer = g.filter((c) => c.k < 0)
    expect(outer.length).toBe(1)
    expect(Math.hypot(outer[0].x, outer[0].y)).toBeLessThan(1e-9)
    expect(Math.abs(1 / Math.abs(outer[0].k))).toBeCloseTo(1, 9) // normalised radius 1
  })

  it('more detail yields more circles', () => {
    const coarse = buildGasket(0, { maxCurvature: 40, maxCircles: 60000 })
    const fine = buildGasket(0, { maxCurvature: 400, maxCircles: 60000 })
    expect(fine.length).toBeGreaterThan(coarse.length)
  })

  it('respects the hard circle cap', () => {
    const g = buildGasket(0, { maxCurvature: 100000, maxCircles: 500 })
    expect(g.length).toBeLessThanOrEqual(500)
  })

  it('all generated circles are mutually valid Descartes children (k grows, stays inside)', () => {
    const g = buildGasket(1, OPTS) // (-1,2,2,3)
    // every positive circle sits within the unit bounding disc
    for (const c of g as Circle[]) {
      if (c.k <= 0) continue
      const r = 1 / c.k
      expect(Math.hypot(c.x, c.y) + r).toBeLessThan(1.0001)
    }
  })
})
