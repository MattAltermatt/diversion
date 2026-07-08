import { describe, it, expect } from 'vitest'
import { shapePresets, colorPresets } from './presets'
import { thornbirdSchema } from './schema'

describe('thornbird presets', () => {
  it('every shape preset patch is a valid partial config', () => {
    const full = thornbirdSchema.parse({})
    for (const p of shapePresets) {
      expect(() => thornbirdSchema.parse({ ...full, ...p.patch })).not.toThrow()
    }
  })

  it('every color preset patch is a valid partial config', () => {
    const full = thornbirdSchema.parse({})
    for (const p of colorPresets) {
      expect(() => thornbirdSchema.parse({
        ...full, background: p.background, blend: p.blend, color: p.color,
      })).not.toThrow()
    }
  })
})
