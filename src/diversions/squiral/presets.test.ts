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
})
