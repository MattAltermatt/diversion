import { describe, it, expect } from 'vitest'
import { kuramotoSchema } from './schema'
import { regimePresets, colorPresets } from './presets'

describe('kuramotoSchema', () => {
  it('parses to defaults (coupling 1.4, aurora wheel)', () => {
    const c = kuramotoSchema.parse({})
    expect(c.coupling).toBeCloseTo(1.4)
    expect(c.spread).toBeCloseTo(0.35)
    expect(c.simSpeed).toBe(2)
    expect(c.stops.length).toBeGreaterThanOrEqual(2)
  })
  it('every slider field carries min/max meta', () => {
    const shape = kuramotoSchema.shape
    for (const key of ['coupling', 'spread', 'simSpeed'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('seed is randomized on fresh load (seedless share links)', () => {
    expect((kuramotoSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
  })
  it('clamps coupling/spread to their bands', () => {
    expect(() => kuramotoSchema.parse({ coupling: 5 })).toThrow()
    expect(() => kuramotoSchema.parse({ spread: -0.1 })).toThrow()
    expect(kuramotoSchema.parse({ coupling: 3 }).coupling).toBe(3)
  })
})

describe('kuramoto presets', () => {
  it('every regime preset patch parses against the schema', () => {
    for (const p of regimePresets) expect(() => kuramotoSchema.parse(p.patch)).not.toThrow()
  })
  it('every color preset supplies 2..8 valid hex stops', () => {
    for (const p of colorPresets) {
      expect(p.patch.stops.length).toBeGreaterThanOrEqual(2)
      expect(p.patch.stops.length).toBeLessThanOrEqual(8)
      for (const s of p.patch.stops) expect(s).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})
