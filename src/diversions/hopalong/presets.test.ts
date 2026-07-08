import { describe, it, expect } from 'vitest'
import { mapPresets, palettePresets } from './presets'
import { hopalongSchema } from './schema'

describe('hopalong presets', () => {
  it('every map preset patch is a valid partial config', () => {
    const full = hopalongSchema.parse({})
    for (const p of mapPresets) {
      expect(() => hopalongSchema.parse({ ...full, ...p.patch })).not.toThrow()
      expect(['martin', 'sine', 'rr']).toContain(p.patch.map)
    }
  })

  it('every palette preset patch is a valid partial config', () => {
    const full = hopalongSchema.parse({})
    for (const p of palettePresets) {
      expect(() => hopalongSchema.parse({
        ...full, background: p.background, palette: p.palette,
      })).not.toThrow()
    }
  })
})
