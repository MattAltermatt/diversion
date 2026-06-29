import { describe, it, expect } from 'vitest'
import { physarumSchema } from './schema'
import { behaviorPresets, colorPresets } from './presets'

describe('physarum presets', () => {
  it('every behavior+color patch parses on top of defaults', () => {
    const base = physarumSchema.parse({})
    for (const p of [...behaviorPresets, ...colorPresets]) {
      expect(() => physarumSchema.parse({ ...base, ...p.patch })).not.toThrow()
    }
  })
  it('ships the Networks/Coral/Veins and six color presets', () => {
    expect(behaviorPresets.map((p) => p.name)).toEqual(['Networks', 'Coral', 'Veins'])
    expect(colorPresets.map((p) => p.name)).toEqual(
      ['Bioluminescence', 'Ember', 'Mono', 'Spore', 'Orchid', 'Aurora', 'Magma'])
  })
})
