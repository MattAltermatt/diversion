import { describe, it, expect } from 'vitest'
import { oklchToHex } from './oklch'

const channels = (hex: string) => [
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
]
const sum = (hex: string) => channels(hex).reduce((a, b) => a + b, 0)

describe('oklchToHex', () => {
  it('returns valid #rrggbb for a sweep of hues', () => {
    for (let h = 0; h < 360; h += 15) {
      expect(oklchToHex(0.72, 0.15, h)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('produces a neutral gray at zero chroma', () => {
    const [r, g, b] = channels(oklchToHex(0.6, 0, 0))
    expect(r).toBe(g)
    expect(g).toBe(b)
  })

  it('gamut-maps extreme chroma without clipping to garbage (still valid, still colored)', () => {
    const hex = oklchToHex(0.72, 0.6, 264) // far out-of-gamut blue chroma
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    // blue channel should dominate — hue survived the chroma reduction
    const [r, , b] = channels(hex)
    expect(b).toBeGreaterThan(r)
  })

  it('higher lightness → brighter overall', () => {
    expect(sum(oklchToHex(0.85, 0.1, 145))).toBeGreaterThan(sum(oklchToHex(0.45, 0.1, 145)))
  })
})
