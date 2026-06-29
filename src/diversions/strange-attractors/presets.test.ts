import { describe, it, expect } from 'vitest'
import { attractorPresets, colorPresets } from './presets'
import { strangeAttractorsSchema } from './schema'

describe('strange-attractors presets', () => {
  it('every attractor preset patch is a valid partial config', () => {
    const full = strangeAttractorsSchema.parse({})
    for (const p of attractorPresets) {
      expect(() => strangeAttractorsSchema.parse({ ...full, ...p.patch })).not.toThrow()
      expect(['clifford', 'deJong']).toContain(p.patch.attractor)
    }
  })

  it('every color preset patch is a valid partial config', () => {
    const full = strangeAttractorsSchema.parse({})
    for (const p of colorPresets) {
      expect(() => strangeAttractorsSchema.parse({
        ...full, background: p.background, blend: p.blend, color: p.color,
      })).not.toThrow()
    }
  })
})
