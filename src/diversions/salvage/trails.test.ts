import { describe, it, expect } from 'vitest'
import { makeTrails, deposit, depositAt, decay, decayFine, recruitColor, clearTrails, fineSub, FINE_CAP } from './trails'
import { TRAIL_RECRUIT } from './state'

describe('trails', () => {
  it('halves in one half-life to within 1%', () => {
    const t = makeTrails(4, 4)
    deposit(t, 1, 5, 1)
    for (let i = 0; i < 100; i++) decay(t, 0.1, 10)
    expect(t.strength[5]).toBeCloseTo(0.5, 2)
    expect(t.color[5]).toBe(1)
  })
  it('reinforces a matching colour and clamps at 1', () => {
    const t = makeTrails(2, 2)
    deposit(t, 0, 0, 0.8); deposit(t, 0, 0, 0.8)
    expect(t.strength[0]).toBe(1)
  })
  it('a foreign colour contests the cell and flips it on crossing zero', () => {
    const t = makeTrails(2, 2)
    deposit(t, 0, 0, 0.3)
    deposit(t, 1, 0, 0.1)
    expect(t.color[0]).toBe(0); expect(t.strength[0]).toBeCloseTo(0.2)
    deposit(t, 1, 0, 0.5)
    expect(t.color[0]).toBe(1); expect(t.strength[0]).toBeCloseTo(0.3)
  })
  it('recruits only above the threshold, and clears', () => {
    const t = makeTrails(2, 2)
    deposit(t, 2, 1, TRAIL_RECRUIT * 0.9)
    expect(recruitColor(t, 1)).toBe(-1)
    deposit(t, 2, 1, TRAIL_RECRUIT)
    expect(recruitColor(t, 1)).toBe(2)
    clearTrails(t)
    expect(recruitColor(t, 1)).toBe(-1)
    expect(t.color[1]).toBe(-1)
  })
})

describe('fine display trails', () => {
  it('fineSub keeps a fine cell between 2 and 3 CSS px across the whole Cell size range', () => {
    for (let cs = 4; cs <= 24; cs++) {
      const sub = fineSub(cs)
      expect(Number.isInteger(sub) && sub >= 1).toBe(true)
      expect(cs / sub).toBeGreaterThanOrEqual(2)
      expect(cs / sub).toBeLessThanOrEqual(3)
    }
  })
  it('fineSub steps down on a canvas whose fine field would exceed FINE_CAP', () => {
    expect(fineSub(10, 192, 108)).toBe(4)          // 1080p at the default: 332k cells, under the cap
    const sub4k = fineSub(10, 384, 216)            // 4K at the default would be 1.33M at sub 4
    expect(sub4k).toBeLessThan(4)
    expect(384 * 216 * sub4k * sub4k).toBeLessThanOrEqual(FINE_CAP)
    expect(fineSub(4, 1000, 1000)).toBe(1)         // never below 1, even over the cap
  })
  it('depositAt marks the coarse cell for recruitment and only the fine cell under the walker for display', () => {
    const t = makeTrails(4, 4, 3)
    expect(t.fcols).toBe(12); expect(t.frows).toBe(12)
    depositAt(t, 1, 1.4, 2.7, 0.2)
    expect(recruitColor(t, 2 * 4 + 1)).toBe(1)
    expect(t.strength[2 * 4 + 1]).toBeCloseTo(0.2)
    const fi = Math.floor(2.7 * 3) * 12 + Math.floor(1.4 * 3)
    // Fine deposit is scaled by sub, so a fine cell crossed in a third of the time still
    // reaches the strength the coarse cell shows.
    expect(t.fcolor[fi]).toBe(1); expect(t.fstrength[fi]).toBeCloseTo(0.6)
    let lit = 0
    for (let i = 0; i < t.fstrength.length; i++) if (t.fstrength[i] > 0) lit++
    expect(lit).toBe(1)
  })
  it('the fine field decays, contests and clears like the coarse one', () => {
    const t = makeTrails(2, 2, 2)
    depositAt(t, 0, 0.5, 0.5, 0.2)
    depositAt(t, 1, 0.5, 0.5, 0.05)
    const fi = 1 * 4 + 1 // (0.5, 0.5) at sub 2 is fine cell (1, 1)
    expect(t.fcolor[fi]).toBe(0); expect(t.fstrength[fi]).toBeCloseTo(0.3) // (0.2 - 0.05) * sub 2
    for (let i = 0; i < 100; i++) decay(t, 0.1, 10)
    // The fine field banks its decay (display only) and settles when rasterised — to
    // exactly what a per-step decay would have produced.
    expect(t.fstrength[fi]).toBeCloseTo(0.3)
    expect(t.fineDue).toBeCloseTo(10)
    decayFine(t, 10)
    expect(t.fstrength[fi]).toBeCloseTo(0.15, 2)
    expect(t.fineDue).toBe(0)
    clearTrails(t)
    expect(t.fstrength[fi]).toBe(0); expect(t.fcolor[fi]).toBe(-1); expect(t.fineDue).toBe(0)
  })
  it('a walker just outside the arena is clamped onto its edge cell', () => {
    const t = makeTrails(2, 2, 2)
    depositAt(t, 0, -0.2, 2.3, 0.5)
    expect(t.color[2]).toBe(0)
    expect(t.fcolor[3 * 4 + 0]).toBe(0)
  })
})
