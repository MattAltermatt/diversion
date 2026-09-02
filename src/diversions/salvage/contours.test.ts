import { describe, it, expect } from 'vitest'
import { buildContours, contourSeed, groundPalette, resamplePalette } from './contours'
import { srgbToOklab } from '../../framework/color'
import { contrastFloor, contrastCeiling } from '../ablation/quantize'

const BATHY = ['#1b4f6b', '#247091', '#2f8b9b', '#67b8ab', '#b2d18d', '#f2e2b0']
const L = (hex: string) => {
  const v = parseInt(hex.slice(1), 16)
  return srgbToOklab((v >> 16) & 255, (v >> 8) & 255, v & 255).L
}

describe('resamplePalette', () => {
  it('returns the stops themselves when the count matches', () => {
    expect(resamplePalette(BATHY, 6)).toEqual(BATHY)
  })

  it('keeps both end stops verbatim at any count', () => {
    for (const n of [2, 3, 5, 9, 12]) {
      const p = resamplePalette(BATHY, n)
      expect(p).toHaveLength(n)
      expect(p[0]).toBe(BATHY[0])
      expect(p[n - 1]).toBe(BATHY[BATHY.length - 1])
    }
  })

  it('stays dark-to-light — the colony reads index order as lightness order', () => {
    for (const n of [3, 8, 12]) {
      const ls = resamplePalette(BATHY, n).map(L)
      for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeGreaterThan(ls[i - 1])
    }
  })

  it('emits valid 6-hex strings only', () => {
    for (const c of resamplePalette(BATHY, 11)) expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('groundPalette', () => {
  it('returns the authored stops verbatim on the dark ground they were designed for', () => {
    expect(groundPalette(BATHY, 6, '#07080c')).toEqual(BATHY)
    expect(groundPalette(BATHY, 3, '#07080c')).toEqual(resamplePalette(BATHY, 3))
  })

  it('pulls the lightest band under the ceiling on a pale ground — otherwise a sixth of the map vanishes', () => {
    const bg = '#f0f0f0'
    for (const ramp of [BATHY, ['#4d4d4d', '#f2f2f2']]) {
      const p = groundPalette(ramp, 6, bg)
      const ls = p.map(L)
      expect(Math.max(...ls)).toBeLessThanOrEqual(contrastCeiling(bg) + 1e-3)
      expect(Math.min(...ls)).toBeGreaterThanOrEqual(contrastFloor(bg) - 1e-3)
      for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeGreaterThan(ls[i - 1])
    }
  })

  it('lifts the darkest band over the floor on a mid-grey ground', () => {
    const bg = '#606060'
    const ls = groundPalette(BATHY, 6, bg).map(L)
    expect(Math.min(...ls)).toBeGreaterThanOrEqual(contrastFloor(bg) - 1e-3)
    expect(Math.max(...ls)).toBeLessThanOrEqual(contrastCeiling(bg) + 1e-3)
  })
})

describe('contourSeed', () => {
  it('differs across generations and across seeds', () => {
    const a = contourSeed(7, 0), b = contourSeed(7, 1), c = contourSeed(8, 0)
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
    expect(contourSeed(7, 0)).toBe(a)
  })
})

describe('buildContours', () => {
  const opts = { seed: 3, generation: 0, bw: 40, bh: 30, colors: 6, palette: BATHY, featureSize: 8, roughness: 0.5, background: '#07080c' }

  it('is the shape quantize() returns: full coverage, every band present, palette of `colors` stops', () => {
    const q = buildContours(opts)
    expect(q.idx).toHaveLength(40 * 30)
    expect(q.coverage.every((v) => v === 1)).toBe(true)
    expect(q.palette).toHaveLength(6)
    const seen = new Set(q.idx)
    expect(seen.size).toBe(6)
    for (const v of seen) expect(v).toBeLessThan(6)
  })

  it('is deterministic for a seed and generation, and a new generation is a new map', () => {
    const a = buildContours(opts), b = buildContours(opts), c = buildContours({ ...opts, generation: 1 })
    expect(Array.from(a.idx)).toEqual(Array.from(b.idx))
    expect(Array.from(a.idx)).not.toEqual(Array.from(c.idx))
  })

  it('bands are roughly equal in mass — quantile cuts, like Ablation', () => {
    const q = buildContours({ ...opts, bw: 60, bh: 60 })
    const counts = new Array(6).fill(0)
    for (const v of q.idx) counts[v]++
    for (const c of counts) expect(c).toBeGreaterThan((60 * 60) / 6 * 0.5)
  })
})
