import { describe, it, expect } from 'vitest'
import { excitableMediaSchema } from './schema'
import { patternPresets, colorPresets } from './presets'

describe('excitableMediaSchema', () => {
  it('parses to defaults (100 states, Ferroin palette)', () => {
    const cfg = excitableMediaSchema.parse({})
    expect(cfg.states).toBe(100)
    expect(cfg.k1).toBe(3)
    expect(cfg.k2).toBe(3)
    expect(cfg.g).toBe(20)
    expect(cfg.simSpeed).toBe(2)
    expect(cfg.stops.length).toBeGreaterThanOrEqual(2)
  })
  it('every slider field carries min/max meta', () => {
    const shape = excitableMediaSchema.shape
    for (const key of ['simSpeed', 'states', 'k1', 'k2', 'g', 'gamma'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('seed is randomized on fresh load (seedless share links)', () => {
    expect((excitableMediaSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
  })
  it('rate knobs are integers within their bands', () => {
    expect(() => excitableMediaSchema.parse({ k1: 2.5 })).toThrow()
    expect(() => excitableMediaSchema.parse({ states: 10 })).toThrow() // below min 20
    expect(excitableMediaSchema.parse({ states: 220 }).states).toBe(220)
  })
})

describe('excitable-media presets', () => {
  it('every pattern preset patch parses against the schema', () => {
    for (const p of patternPresets) {
      expect(() => excitableMediaSchema.parse(p.patch)).not.toThrow()
    }
  })
  it('every color preset supplies 2..8 valid hex stops', () => {
    for (const p of colorPresets) {
      expect(p.patch.stops.length).toBeGreaterThanOrEqual(2)
      expect(p.patch.stops.length).toBeLessThanOrEqual(8)
      for (const s of p.patch.stops) expect(s).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})
