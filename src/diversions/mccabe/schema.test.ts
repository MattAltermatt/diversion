import { describe, it, expect } from 'vitest'
import { mccabeSchema } from './schema'
import { palettePresets, patternPresets } from './presets'

describe('mccabeSchema', () => {
  it('parses to defaults (copper ramp, mid feature size)', () => {
    const c = mccabeSchema.parse({})
    expect(c.scale).toBeCloseTo(1.5)
    expect(c.contrast).toBeCloseTo(1.1)
    expect(c.speed).toBeCloseTo(1.2)
    expect(c.palette.length).toBeGreaterThanOrEqual(2)
  })
  it('every slider field carries min/max meta', () => {
    const shape = mccabeSchema.shape
    for (const key of ['scale', 'contrast', 'speed'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('seed is randomized on fresh load (seedless share links)', () => {
    expect((mccabeSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
  })
})

describe('mccabe presets', () => {
  it('every preset patch parses against the schema', () => {
    for (const p of [...patternPresets, ...palettePresets]) {
      expect(() => mccabeSchema.parse(p.patch)).not.toThrow()
    }
  })
})
