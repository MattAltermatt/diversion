import { describe, it, expect } from 'vitest'
import { paletteColors, PALETTE_NAMES } from './palette'

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
