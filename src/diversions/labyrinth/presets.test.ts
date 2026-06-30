import { describe, it, expect } from 'vitest'
import { densityPresets, behaviorPresets, colorPresets } from './presets'
import { labyrinthSchema } from './schema'

describe('presets', () => {
  it('every patch merges onto defaults to a schema-valid config', () => {
    const base = labyrinthSchema.parse({})
    for (const p of [...densityPresets, ...behaviorPresets, ...colorPresets])
      expect(() => labyrinthSchema.parse({ ...base, ...p.patch })).not.toThrow()
  })

  it('each group patches a consistent key-set (matchPresets requires equal keys)', () => {
    for (const group of [densityPresets, behaviorPresets, colorPresets]) {
      const keys = group.map((p) => Object.keys(p.patch).sort().join(','))
      expect(new Set(keys).size).toBe(1)
    }
  })

  it('the Veins behavior preset matches the schema defaults (so it shows selected at start)', () => {
    const base = labyrinthSchema.parse({})
    const veins = behaviorPresets.find((p) => p.name === 'Veins')!
    for (const [k, v] of Object.entries(veins.patch))
      expect((base as Record<string, unknown>)[k]).toBe(v)
  })
})
