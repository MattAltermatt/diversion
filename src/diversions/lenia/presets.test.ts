import { describe, it, expect } from 'vitest'
import { patternPresets, colorPresets } from './presets'
import { leniaSchema } from './schema'

describe('lenia presets', () => {
  it('has the four named patterns and four palettes', () => {
    expect(patternPresets.map((p) => p.name)).toEqual(['Coral', 'Cells', 'Veins', 'Rings'])
    expect(colorPresets.map((p) => p.name)).toEqual(['Bioluminescence', 'Ember', 'Jade', 'Spectral'])
  })
  it('every pattern patch parses inside the schema bands', () => {
    for (const p of patternPresets) {
      expect(() => leniaSchema.parse(p.patch)).not.toThrow()
    }
  })
  it('every palette patch is valid 6-hex and parses', () => {
    for (const p of colorPresets) {
      expect(() => leniaSchema.parse({ stops: p.patch.stops })).not.toThrow()
      for (const s of p.patch.stops) expect(s).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})
