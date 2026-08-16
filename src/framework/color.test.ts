import { describe, it, expect } from 'vitest'
import { parseHex8, parseHex6, hexToRgb, mix, rgba, hslToRgb, srgbToOklab, oklabToHex } from './color'

describe('parseHex8', () => {
  it('parses #rrggbbaa to 0-255 channels with alpha in 0..1', () => {
    expect(parseHex8('#ff8000ff')).toEqual({ r: 255, g: 128, b: 0, a: 1 })
    expect(parseHex8('#00000000')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(parseHex8('#102030cc')).toEqual({ r: 16, g: 32, b: 48, a: 204 / 255 })
  })
})

describe('parseHex6', () => {
  it('parses #rrggbb to 0-255 channels, fully opaque', () => {
    expect(parseHex6('#ffffff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseHex6('#0a0a14')).toEqual({ r: 10, g: 10, b: 20, a: 1 })
  })
})

describe('hexToRgb (WebGL 0-1 float form)', () => {
  it('parses #rrggbb to [r, g, b] floats in 0..1', () => {
    expect(hexToRgb('#ffffff')).toEqual([1, 1, 1])
    expect(hexToRgb('#000000')).toEqual([0, 0, 0])
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0])
  })

  it('stays inside the 0..1 range for arbitrary colours', () => {
    for (const hex of ['#123456', '#abcdef', '#7f7f7f']) {
      for (const c of hexToRgb(hex)) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('mix', () => {
  it('returns endpoints at t=0 and t=1', () => {
    const a = { r: 10, g: 20, b: 30 }
    const b = { r: 200, g: 100, b: 0 }
    expect(mix(a, b, 0)).toEqual({ r: 10, g: 20, b: 30 })
    expect(mix(a, b, 1)).toEqual({ r: 200, g: 100, b: 0 })
  })

  it('rounds to integer channels at the midpoint', () => {
    expect(mix({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0.5)).toEqual({
      r: 128, g: 128, b: 128, // Math.round(127.5)
    })
  })
})

describe('rgba', () => {
  it('builds a CSS string with rounded channels and a numeric alpha', () => {
    expect(rgba({ r: 10, g: 20, b: 30 }, 0.5)).toBe('rgba(10,20,30,0.5)')
    expect(rgba({ r: 4.5, g: 9.2, b: 200.9 }, 1)).toBe('rgba(5,9,201,1)')
  })

  it('passes through a pre-formatted alpha string', () => {
    expect(rgba({ r: 118, g: 118, b: 118 }, (0.3).toFixed(3))).toBe('rgba(118,118,118,0.300)')
  })
})

describe('hslToRgb', () => {
  it('maps primary hues', () => {
    expect(hslToRgb(0, 100, 50)).toEqual({ r: 255, g: 0, b: 0 })
    expect(hslToRgb(120, 100, 50)).toEqual({ r: 0, g: 255, b: 0 })
    expect(hslToRgb(240, 100, 50)).toEqual({ r: 0, g: 0, b: 255 })
  })
  it('greyscale when saturation 0', () => {
    expect(hslToRgb(123, 0, 50)).toEqual({ r: 128, g: 128, b: 128 })
  })
  it('wraps hue past 360 and below 0', () => {
    expect(hslToRgb(360, 100, 50)).toEqual(hslToRgb(0, 100, 50))
    expect(hslToRgb(-120, 100, 50)).toEqual(hslToRgb(240, 100, 50))
  })
})

describe('OKLab (#278)', () => {
  it('black and white sit at the ends of L', () => {
    expect(srgbToOklab(0, 0, 0).L).toBeCloseTo(0, 3)
    expect(srgbToOklab(255, 255, 255).L).toBeCloseTo(1, 3)
  })

  it('greys are achromatic', () => {
    const g = srgbToOklab(128, 128, 128)
    expect(g.a).toBeCloseTo(0, 3)
    expect(g.b).toBeCloseTo(0, 3)
  })

  it('round-trips a saturated colour to within one channel step', () => {
    for (const hex of ['#1b4f6b', '#f2e2b0', '#ff0000', '#00ff00', '#0000ff']) {
      const n = parseInt(hex.slice(1), 16)
      const lab = srgbToOklab((n >> 16) & 255, (n >> 8) & 255, n & 255)
      expect(oklabToHex(lab)).toBe(hex)
    }
  })

  it('clamps out-of-gamut Lab back into sRGB rather than emitting NaN', () => {
    expect(oklabToHex({ L: 1.4, a: 0.3, b: -0.3 })).toMatch(/^#[0-9a-f]{6}$/)
  })
})
