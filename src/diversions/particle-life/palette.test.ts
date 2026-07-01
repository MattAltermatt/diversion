import { describe, it, expect } from 'vitest'
import { paletteColors, PALETTE_NAMES } from './palette'
import { oklchToHex } from './oklch'

describe('Mariners palette', () => {
  it('is the first palette name (the new default)', () => {
    expect(PALETTE_NAMES[0]).toBe('Mariners')
  })

  it('6 species = the six anchors exactly', () => {
    expect(paletteColors('Mariners', 6)).toEqual([
      oklchToHex(0.40, 0.11, 258),
      oklchToHex(0.55, 0.15, 256),
      oklchToHex(0.78, 0.09, 240),
      oklchToHex(0.90, 0.015, 250),
      oklchToHex(0.88, 0.06, 92),
      oklchToHex(0.80, 0.145, 85),
    ])
  })
})

describe('paletteColors', () => {
  it('returns n valid, distinct hex colors for every preset', () => {
    for (const name of PALETTE_NAMES) {
      for (const n of [3, 6, 8]) {
        const cols = paletteColors(name, n)
        expect(cols.length).toBe(n)
        for (const c of cols) expect(c).toMatch(/^#[0-9a-f]{6}$/)
        expect(new Set(cols).size).toBe(n) // all distinct
      }
    }
  })

  it('is deterministic', () => {
    expect(paletteColors('Neon', 6)).toEqual(paletteColors('Neon', 6))
  })
})
