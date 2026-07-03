import { describe, it, expect } from 'vitest'
import { simDims, buildLUT, buildTerritoryColors, decayFromReach, MAX_HUES } from './field'

describe('simDims', () => {
  it('caps the longest side at gridResolution, preserving aspect', () => {
    const { sw, sh } = simDims(1920, 1080, 96)
    expect(sw).toBe(96)
    expect(sh).toBe(54)
  })
  it('never upsizes a small canvas', () => {
    expect(simDims(40, 30, 96)).toEqual({ sw: 40, sh: 30 })
  })
})

describe('decayFromReach', () => {
  it('a larger reach (broader gradient) gives a smaller decay', () => {
    expect(decayFromReach(0.3, 96)).toBeGreaterThan(decayFromReach(0.9, 96))
  })
  it('k = D / (reach·side)² for a plain case', () => {
    // reach 0.5 on a 96-side → λ=48 texels → k = 1/48²
    expect(decayFromReach(0.5, 96)).toBeCloseTo(1 / (48 * 48), 8)
  })
})

describe('buildLUT', () => {
  it('produces a 256×RGBA byte ramp, dark end darker than bright end', () => {
    const lut = buildLUT(['#000000', '#ffffff'])
    expect(lut.length).toBe(256 * 4)
    const lo = lut[0] + lut[1] + lut[2]
    const hi = lut[255 * 4] + lut[255 * 4 + 1] + lut[255 * 4 + 2]
    expect(hi).toBeGreaterThan(lo)
  })
})

describe('buildTerritoryColors', () => {
  it('fills MAX_HUES rgb triples in 0..1, cycling short lists', () => {
    const t = buildTerritoryColors(['#ff0000', '#00ff00'])
    expect(t.length).toBe(MAX_HUES * 3)
    expect(t[0]).toBeCloseTo(1) // first hue red
    expect(t[3]).toBeCloseTo(0) // second hue green → r≈0
    expect(t[4]).toBeCloseTo(1)
    // cycles: 3rd slot back to red
    expect(t[6]).toBeCloseTo(1)
    expect(t.every((v) => v >= 0 && v <= 1)).toBe(true)
  })
})
