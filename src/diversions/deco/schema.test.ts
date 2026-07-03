import { describe, it, expect } from 'vitest'
import { decoSchema, SPLITS } from './schema'
import { palettePresets } from './presets'

describe('decoSchema', () => {
  it('parses to defaults (depth 6, golden split, De Stijl palette)', () => {
    const c = decoSchema.parse({})
    expect(c.depth).toBe(6)
    expect(c.split).toBe('Golden')
    expect(c.borderWidth).toBe(5)
    expect(c.palette.length).toBeGreaterThanOrEqual(2)
  })
  it('every slider field carries min/max meta', () => {
    const shape = decoSchema.shape
    for (const key of ['depth', 'speed', 'hold', 'borderWidth'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('split is a segmented enum; seed is randomized on fresh load', () => {
    expect((decoSchema.shape.split as any).meta().ui).toBe('segmented')
    expect(() => decoSchema.parse({ split: 'Nope' })).toThrow()
    expect((decoSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
    expect(SPLITS.length).toBeGreaterThan(1)
  })
})

describe('deco presets', () => {
  it('every palette preset patch parses against the schema', () => {
    for (const p of palettePresets) expect(() => decoSchema.parse(p.patch)).not.toThrow()
  })
})
