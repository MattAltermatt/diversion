import { describe, it, expect } from 'vitest'
import {
  hexToRgba, trailFadeAlpha, toHex2, sampleGradient, sampleGradientRGBA, sampleCyclic,
  buildGradientLUT, gradientIndex, GRADIENT_LUT_SIZE,
} from './gradient'

describe('hexToRgba', () => {
  it('formats #rrggbbaa as an rgba() string with 3dp alpha', () => {
    expect(hexToRgba('#ff8000ff')).toBe('rgba(255, 128, 0, 1)')
    expect(hexToRgba('#10203080')).toBe('rgba(16, 32, 48, 0.502)')
  })
})

describe('trailFadeAlpha', () => {
  it('maps endpoints: 0 → hard wipe, 100 → longest trail', () => {
    expect(trailFadeAlpha(0)).toBe(1) // 1 survival frame
    expect(trailFadeAlpha(100)).toBeCloseTo(0.02, 10) // 50 survival frames
  })

  it('clamps out-of-range input', () => {
    expect(trailFadeAlpha(-50)).toBe(1)
    expect(trailFadeAlpha(200)).toBeCloseTo(0.02, 10)
  })
})

describe('toHex2', () => {
  it('maps 0..1 alpha to a two-digit hex byte', () => {
    expect(toHex2(0)).toBe('00')
    expect(toHex2(1)).toBe('ff')
    expect(toHex2(0.1376)).toBe('23')
  })
})

describe('sampleGradient (CSS string form)', () => {
  it('returns a single stop verbatim', () => {
    expect(sampleGradient(['#ff0000ff'], 0.5, false)).toBe('rgba(255, 0, 0, 1)')
  })

  it('interpolates linearly between two stops', () => {
    expect(sampleGradient(['#000000ff', '#ffffffff'], 0.5, false)).toBe('rgba(128, 128, 128, 1)')
  })

  it('wraps the last stop back to the first when wrap=true', () => {
    // at t=1 (cyclic) it should blend back toward the first stop, not clamp
    expect(sampleGradient(['#000000ff', '#ffffffff'], 1, true)).toBe('rgba(0, 0, 0, 1)')
  })
})

describe('sampleGradientRGBA (interpolated channel form)', () => {
  it('returns a single stop as parsed channels', () => {
    expect(sampleGradientRGBA(['#ff0000ff'], 0.3)).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  it('interpolates without rounding (channels stay fractional)', () => {
    const c = sampleGradientRGBA(['#000000ff', '#ffffffff'], 0.5)
    expect(c).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 })
  })

  it('keeps channels in 0-255 and alpha in 0..1', () => {
    const c = sampleGradientRGBA(['#102030ff', '#a0b0c000'], 0.5)
    for (const ch of [c.r, c.g, c.b]) {
      expect(ch).toBeGreaterThanOrEqual(0)
      expect(ch).toBeLessThanOrEqual(255)
    }
    expect(c.a).toBeGreaterThanOrEqual(0)
    expect(c.a).toBeLessThanOrEqual(1)
  })
})

describe('sampleCyclic', () => {
  it('wraps so t=0 and t=1 land on the first stop', () => {
    const stops = ['#ff0000ff', '#00ff00ff', '#0000ffff']
    expect(sampleCyclic(stops, 0)).toEqual(sampleCyclic(stops, 1))
  })
})

describe('gradient LUT (hot-loop lookup form)', () => {
  const stops = ['#ff0000ff', '#00ff00ff', '#0000ffff']

  it('builds a full-size LUT whose endpoints match sampleGradient', () => {
    const lut = buildGradientLUT(stops, false)
    expect(lut).toHaveLength(GRADIENT_LUT_SIZE)
    expect(lut[0]).toBe(sampleGradient(stops, 0, false))
    expect(lut[GRADIENT_LUT_SIZE - 1]).toBe(sampleGradient(stops, 1, false))
  })

  it('gradientIndex maps t∈[0,1] to a nearest-neighbour index, clamped', () => {
    expect(gradientIndex(0)).toBe(0)
    expect(gradientIndex(1)).toBe(GRADIENT_LUT_SIZE - 1)
    expect(gradientIndex(0.5)).toBe(Math.round(0.5 * (GRADIENT_LUT_SIZE - 1)))
    expect(gradientIndex(-1)).toBe(0) // clamps below
    expect(gradientIndex(2)).toBe(GRADIENT_LUT_SIZE - 1) // clamps above
  })

  it('lookup tracks sampleGradient within the 1/256 quantization (sub-perceptual)', () => {
    const lut = buildGradientLUT(stops, false)
    const rgb = (s: string) => s.match(/\d+/g)!.slice(0, 3).map(Number)
    for (const t of [0.13, 0.37, 0.5, 0.62, 0.88]) {
      const got = rgb(lut[gradientIndex(t)])
      const want = rgb(sampleGradient(stops, t, false))
      for (let c = 0; c < 3; c++) expect(Math.abs(got[c] - want[c])).toBeLessThanOrEqual(2)
    }
  })

  it('respects wrap mode (cyclic endpoint)', () => {
    const lut = buildGradientLUT(stops, true)
    expect(lut[GRADIENT_LUT_SIZE - 1]).toBe(sampleGradient(stops, 1, true))
  })

  it('cyclic interior lookups also track sampleGradient(wrap=true)', () => {
    const lut = buildGradientLUT(stops, true)
    const rgb = (s: string) => s.match(/\d+/g)!.slice(0, 3).map(Number)
    for (const t of [0.17, 0.42, 0.66, 0.83, 0.95]) {
      const got = rgb(lut[gradientIndex(t)])
      const want = rgb(sampleGradient(stops, t, true))
      for (let c = 0; c < 3; c++) expect(Math.abs(got[c] - want[c])).toBeLessThanOrEqual(2)
    }
  })
})
