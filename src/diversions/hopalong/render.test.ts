import { describe, it, expect } from 'vitest'
import { toneOf, lutIndex, buildPaletteLUT, LUT_SIZE } from './render'

describe('toneOf (log density tone curve)', () => {
  it('count=0 -> 0', () => {
    expect(toneOf(0, 100)).toBe(0)
  })

  it('reaches full brightness at the FIXED density reference (24) and clips '
    + 'above it — the common structure hits the palette\'s bright stops while '
    + 'rare dense cusps just clip to white', () => {
    expect(toneOf(24, 0)).toBeCloseTo(1, 5)
    expect(toneOf(100, 0)).toBe(1)
  })

  it('is independent of the running max — the reference is FIXED, so the same '
    + 'density renders the same brightness regardless of the peak elsewhere on '
    + 'screen (a running-peak divisor was the dim/blown-out instability)', () => {
    expect(toneOf(5, 10)).toBe(toneOf(5, 1000000))
    expect(toneOf(12, 30)).toBe(toneOf(12, 999999))
  })

  it('is monotonically non-decreasing in count, strictly increasing below the '
    + 'reference', () => {
    let prev = -1
    for (const count of [1, 2, 4, 8, 16, 24, 100, 500]) {
      const t = toneOf(count, 0)
      expect(t).toBeGreaterThanOrEqual(prev)
      prev = t
    }
    expect(toneOf(16, 0)).toBeGreaterThan(toneOf(8, 0))
    expect(toneOf(8, 0)).toBeGreaterThan(toneOf(4, 0))
  })

  it('keeps a lone hit dim but clearly visible (Hopalong is a space-filling '
    + 'scatter — the sparse single-hit cells ARE the structure, so they read as '
    + 'a tint near the palette start, not flooded away; only true zeros stay '
    + 'background)', () => {
    expect(toneOf(0, 0)).toBe(0)
    expect(toneOf(1, 0)).toBeGreaterThan(0.1)
    expect(toneOf(1, 0)).toBeLessThan(0.3)
  })

  it('never exceeds 1', () => {
    expect(toneOf(1000, 10)).toBe(1)
  })

  it('log compression: the SAME +1 hit moves brightness far more at low counts '
    + 'than at high — diminishing returns keep dense edges from blowing out', () => {
    const lowJump = toneOf(2, 0) - toneOf(1, 0)
    const highJump = toneOf(19, 0) - toneOf(18, 0)
    expect(lowJump).toBeGreaterThan(highJump * 2)
  })
})

describe('lutIndex', () => {
  it('maps 0 -> 0 and 1 -> LUT_SIZE-1', () => {
    expect(lutIndex(0)).toBe(0)
    expect(lutIndex(1)).toBe(LUT_SIZE - 1)
  })

  it('clamps out-of-range t', () => {
    expect(lutIndex(-5)).toBe(0)
    expect(lutIndex(5)).toBe(LUT_SIZE - 1)
  })
})

describe('buildPaletteLUT', () => {
  it('endpoints match the first and last palette stop exactly', () => {
    const lut = buildPaletteLUT(['#112233', '#aabbcc'])
    expect(lut.r[0]).toBe(0x11); expect(lut.g[0]).toBe(0x22); expect(lut.b[0]).toBe(0x33)
    const last = LUT_SIZE - 1
    expect(lut.r[last]).toBe(0xaa); expect(lut.g[last]).toBe(0xbb); expect(lut.b[last]).toBe(0xcc)
  })

  it('interpolates monotonically across a two-stop ramp', () => {
    const lut = buildPaletteLUT(['#000000', '#ffffff'])
    for (let i = 1; i < LUT_SIZE; i++) {
      expect(lut.r[i]).toBeGreaterThanOrEqual(lut.r[i - 1])
    }
  })

  it('a single-color palette is unusable per schema (min 2) — but the '
    + 'interpolator degrades to a flat LUT rather than throwing', () => {
    const lut = buildPaletteLUT(['#336699'])
    expect(lut.r[0]).toBe(0x33)
    expect(lut.r[LUT_SIZE - 1]).toBe(0x33)
  })
})
