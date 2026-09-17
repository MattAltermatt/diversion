import { describe, expect, it } from 'vitest'
import { SPECIES, bestAt, habitability } from './species'

describe('habitability', () => {
  it('is a tent inside the band: 1.0 at centre, 0.72 at the edges', () => {
    for (let s = 0; s < SPECIES.length; s++) {
      const [lo, hi] = SPECIES[s].band
      expect(habitability(s, (lo + hi) / 2)).toBeCloseTo(1.0, 6)
      expect(habitability(s, lo)).toBeCloseTo(0.72, 6)
      expect(habitability(s, hi)).toBeCloseTo(0.72, 6)
    }
  })

  it('steps DISCONTINUOUSLY to the shoulder at the band edge', () => {
    // Measured: 0.720 just inside, 0.545 just outside. A continuous ramp — the "plateau
    // with a smooth shoulder" an earlier draft described — would not show this drop.
    for (let s = 0; s < SPECIES.length; s++) {
      const [lo] = SPECIES[s].band
      const inside = habitability(s, lo)
      const outside = habitability(s, lo - 0.001)
      expect(inside - outside).toBeGreaterThan(0.15)
    }
  })

  it('holds a 0.55 shoulder outside the band, falling linearly to zero', () => {
    // Asserting only the SIZE of the step (> 0.15) passes for `return 0` outside the band,
    // which deletes the shoulder entirely — and the shoulder is what lets a species hold a
    // contested margin, and what die-back's stress > 0.46 threshold is calibrated against.
    for (let s = 0; s < SPECIES.length; s++) {
      const [lo, hi] = SPECIES[s].band
      expect(habitability(s, lo - 0.05)).toBeCloseTo(0.55 * (1 - 0.05 / 0.11), 3)
      expect(habitability(s, hi + 0.02)).toBeCloseTo(0.55 * (1 - 0.02 / 0.11), 3)
    }
  })

  it('reaches zero 0.11 beyond the band', () => {
    for (let s = 0; s < SPECIES.length; s++) {
      const [lo, hi] = SPECIES[s].band
      // Exactly at the edge of support, `lo - 0.11` carries a float residue (~6e-17), so
      // the result is a hair above zero rather than +0. Beyond it, Math.max clamps hard.
      expect(habitability(s, lo - 0.11)).toBeLessThan(1e-12)
      expect(habitability(s, hi + 0.11)).toBeLessThan(1e-12)
      expect(habitability(s, lo - 0.2)).toBe(0)
      expect(habitability(s, hi + 0.2)).toBe(0)
    }
  })
})

describe('the community sorts into bands', () => {
  it('gives every species a wetness where it is the strict best', () => {
    // A species that is never optimal never appears on screen, and no colour test can
    // see that. Note the earlier wording allowed "or the species is dead weight", which
    // made the assertion unfalsifiable.
    const winners = new Set<number>()
    for (let i = 0; i <= 1000; i++) {
      const b = bestAt(i / 1000)
      if (b >= 0) winners.add(b)
    }
    for (let s = 0; s < SPECIES.length; s++) expect(winners.has(s)).toBe(true)
  })

  it('orders the winners monotonically in wetness, so bands cannot interleave', () => {
    // Measured: 4 -> 3 -> 2 -> 1 -> 0 as wetness rises. Swapping any two bands breaks it.
    const order: number[] = []
    for (let i = 0; i <= 1000; i++) {
      const b = bestAt(i / 1000)
      if (b >= 0 && order[order.length - 1] !== b) order.push(b)
    }
    expect(order).toEqual([4, 3, 2, 1, 0])
  })
})

describe('the species table', () => {
  it('is ordered wet to dry', () => {
    for (let s = 1; s < SPECIES.length; s++) {
      expect(SPECIES[s].band[0]).toBeLessThan(SPECIES[s - 1].band[0])
    }
  })

  it('has overlapping bands, which is what makes margins contested', () => {
    for (let s = 1; s < SPECIES.length; s++) {
      expect(SPECIES[s].band[1]).toBeGreaterThan(SPECIES[s - 1].band[0])
    }
  })
})
