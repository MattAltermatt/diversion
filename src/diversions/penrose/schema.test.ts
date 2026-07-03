import { describe, it, expect } from 'vitest'
import { penroseSchema } from './schema'
import { palettePresets } from './presets'

describe('penroseSchema', () => {
  it('parses to defaults (depth 5, amber/purple)', () => {
    const c = penroseSchema.parse({})
    expect(c.depth).toBe(5)
    expect(c.spin).toBeCloseTo(0.1)
    expect(c.thick).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(c.thin).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
  it('every slider field carries min/max meta', () => {
    const shape = penroseSchema.shape
    for (const key of ['depth', 'lineWidth', 'spin'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('seed is randomized on fresh load (seedless share links)', () => {
    expect((penroseSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
  })
  it('depth is an integer within its band', () => {
    expect(() => penroseSchema.parse({ depth: 5.5 })).toThrow()
    expect(() => penroseSchema.parse({ depth: 7 })).toThrow()
    expect(penroseSchema.parse({ depth: 6 }).depth).toBe(6)
  })
})

describe('penrose presets', () => {
  it('every palette preset patch parses against the schema', () => {
    for (const p of palettePresets) expect(() => penroseSchema.parse(p.patch)).not.toThrow()
  })
})
