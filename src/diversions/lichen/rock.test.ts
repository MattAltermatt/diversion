import { describe, expect, it } from 'vitest'
import { ARENA_COLS, ARENA_ROWS, buildRock, computeSterile, computeWet } from './rock'

const W = ARENA_COLS, H = ARENA_ROWS

const rowMean = (r: ReturnType<typeof buildRock>, y: number) => {
  let s = 0
  for (let x = 0; x < r.w; x++) s += r.wet[y * r.w + x]
  return s / r.w
}

describe('buildRock', () => {
  it('is a pure function of (w, h, seed)', () => {
    const a = buildRock(W, H, 5), b = buildRock(W, H, 5), c = buildRock(W, H, 6)
    expect(Array.from(a.relief)).toEqual(Array.from(b.relief))
    expect(Array.from(a.relief)).not.toEqual(Array.from(c.relief))
  })
})

describe('computeWet', () => {
  it('falls off with height above the water line — in the ROW MEAN', () => {
    // Per-cell monotonicity is FALSE at the default relief and asserting it would be
    // asserting a bug: the hold term is +/-0.2 against a per-row falloff of ~0.016.
    const r = buildRock(W, H, 1)
    computeWet(r, 0.55, 0.5)
    for (let y = 1; y < Math.floor(r.waterRow); y++) {
      expect(rowMean(r, y)).toBeGreaterThanOrEqual(rowMean(r, y - 1) - 1e-9)
    }
  })

  it('hollows hold water and ridges shed it — the term is two-sided', () => {
    // Measured: centring `hold` on the field's own median gives an exact 50/50 split on
    // every seed. Centring it on a hardcoded 0.5 (the original) gives 81.5% positive,
    // i.e. almost no "ridges shed" half at all. That is the mutant this kills.
    for (const seed of [1, 2, 7]) {
      const r = buildRock(W, H, seed)
      let positive = 0
      for (const v of r.relief) if (r.reliefMid - v > 0) positive++
      const frac = positive / r.relief.length
      expect(frac).toBeGreaterThan(0.45)
      expect(frac).toBeLessThan(0.55)
    }
  })

  it('makes hollows wetter than ridges within the same row', () => {
    // The directional statement of the mechanic — a sign flip on `hold` fails here
    // while leaving row means and two-sidedness untouched.
    const r = buildRock(W, H, 1)
    computeWet(r, 0.55, 1)
    const y = Math.floor(r.waterRow * 0.5)
    let hollowSum = 0, hollowN = 0, ridgeSum = 0, ridgeN = 0
    for (let x = 0; x < r.w; x++) {
      const i = y * r.w + x
      if (r.relief[i] < r.reliefMid) { hollowSum += r.wet[i]; hollowN++ }
      else { ridgeSum += r.wet[i]; ridgeN++ }
    }
    expect(hollowSum / hollowN).toBeGreaterThan(ridgeSum / ridgeN)
  })

  it('raises wetness at a fixed row as exposure rises', () => {
    const r = buildRock(W, H, 1)
    const y = Math.floor(r.waterRow * 0.6)
    computeWet(r, 0.15, 0); const low = rowMean(r, y)
    computeWet(r, 1.0, 0); const high = rowMean(r, y)
    expect(high).toBeGreaterThan(low)
  })

  it('clamps to [0,1] where the clamp actually binds', () => {
    const r = buildRock(W, H, 1)
    computeWet(r, 0.55, 1) // measured: 1934 cells sit at a bound here
    for (const v of r.wet) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('writes rather than accumulates', () => {
    const r = buildRock(W, H, 1)
    computeWet(r, 0.55, 0.5); const once = Array.from(r.wet)
    computeWet(r, 0.55, 0.5)
    expect(Array.from(r.wet)).toEqual(once)
  })
})

describe('computeSterile', () => {
  it('hits the requested fraction at both style extremes, across seeds', () => {
    for (const seed of [1, 2, 3, 9]) {
      const r = buildRock(W, H, seed)
      for (const amount of [8, 12, 30]) {
        for (const style of [0, 35, 100]) {
          computeSterile(r, amount, style)
          let c = 0
          for (const v of r.sterile) c += v
          expect(Math.abs(c / r.sterile.length * 100 - amount)).toBeLessThan(1)
        }
      }
    }
  })

  it('marks nothing at zero', () => {
    const r = buildRock(W, H, 1)
    computeSterile(r, 0, 50)
    expect(r.sterile.reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('scatters sterile ground rather than blocking it into bands', () => {
    // A fraction-only test cannot see the real regression. Reverting the vein field to a
    // hard cutoff still hits the requested fraction EXACTLY — the histogram cap sees to
    // that — while producing a solid slab of sterile cells in raster order. Dispersion is
    // what separates them.
    // Sweep the STYLE, do not test one blend. Measured: a sparse ranking field puts 83%
    // of sterile ground in a single band at style 0 while looking perfectly healthy at
    // the default 35, because the speckle field dominates the blend there. A test at the
    // default alone passes the broken implementation.
    const r = buildRock(W, H, 1)
    for (const style of [0, 35, 100]) {
      computeSterile(r, 12, style)
      const bands = 10
      const perBand = new Array(bands).fill(0)
      let total = 0
      for (let y = 0; y < r.h; y++) {
        const band = Math.min(bands - 1, Math.floor(y / r.h * bands))
        for (let x = 0; x < r.w; x++) {
          if (r.sterile[y * r.w + x]) { perBand[band]++; total++ }
        }
      }
      // A uniform scatter puts 10% in each band; allow generous slack for real structure.
      for (const c of perBand) expect(c / total).toBeLessThan(0.30)
    }
  })
})
