import { describe, it, expect } from 'vitest'
import { patternPresets, colorPresets } from './presets'
import { grayScottSchema } from './schema'

describe('grayscott presets', () => {
  it('has the five named patterns and four palettes', () => {
    expect(patternPresets.map((p) => p.name)).toEqual(['Coral', 'Mitosis', 'Maze', 'Spots', 'Worms'])
    expect(colorPresets.map((p) => p.name)).toEqual(['Deep Coral', 'Ink Bloom', 'Magma', 'Bone'])
  })
  it('every pattern patch parses inside the schema feed/kill bands', () => {
    for (const p of patternPresets) {
      expect(() => grayScottSchema.parse({ feed: p.patch.feed, kill: p.patch.kill })).not.toThrow()
    }
  })
  it('every palette patch is valid 6-hex and parses', () => {
    for (const p of colorPresets) {
      expect(() => grayScottSchema.parse({ stops: p.patch.stops })).not.toThrow()
      for (const s of p.patch.stops) expect(s).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})
