import { describe, it, expect } from 'vitest'
import { neuralCaSchema } from './schema'
import { texturePresets } from './presets'
import { CURATED } from './models'

describe('neural-ca presets', () => {
  it('ships one Texture preset per curated model', () => {
    expect(texturePresets.length).toBe(CURATED.length)
    expect(texturePresets.map((p) => p.name)).toEqual(CURATED.map((m) => m.label))
  })

  it('every texture patch parses on top of defaults and selects a valid pattern', () => {
    const base = neuralCaSchema.parse({})
    for (const p of texturePresets) {
      const cfg = neuralCaSchema.parse({ ...base, ...p.patch })
      expect(cfg.pattern).toBe(p.patch.pattern)
    }
  })
})
