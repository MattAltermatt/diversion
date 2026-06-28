import { describe, it, expect } from 'vitest'
import { squiralSchema } from './schema'
import { motionPresets, colorPresets } from './presets'

describe('squiral presets', () => {
  it('every motion + color patch parses against the schema', () => {
    for (const p of [...motionPresets, ...colorPresets]) {
      expect(() => squiralSchema.parse({ ...squiralSchema.parse({}), ...p.patch })).not.toThrow()
    }
  })
  it('has both axes populated', () => {
    expect(motionPresets.length).toBeGreaterThanOrEqual(3)
    expect(colorPresets.length).toBeGreaterThanOrEqual(4)
  })

  // matchPresets assumes every option in a group shares one key-set (see
  // framework/presets.ts). A mixed-width group lets a config that matches a wider
  // patch also match a narrower earlier one (subset), flipping the dropdown wrong.
  it.each([
    ['motion', motionPresets],
    ['color', colorPresets],
  ])('every %s preset patches the same key-set', (_name, group) => {
    const keysets = group.map((p) => Object.keys(p.patch).sort().join(','))
    expect(new Set(keysets).size).toBe(1)
  })

  it('color presets that do not restyle cells carry the schema-default cellStyle', () => {
    const defaultCellStyle = squiralSchema.parse({}).cellStyle
    for (const p of colorPresets) {
      expect(p.patch).toHaveProperty('cellStyle')
    }
    const ember = colorPresets.find((p) => p.name === 'Ember')!
    expect(ember.patch.cellStyle).toBe(defaultCellStyle)
  })
})
