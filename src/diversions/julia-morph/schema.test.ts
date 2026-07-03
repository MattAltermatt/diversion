import { describe, it, expect } from 'vitest'
import { juliaMorphSchema } from './schema'
import { familyPresets, colorPresets } from './presets'

describe('juliaMorphSchema', () => {
  it('parses to defaults (classic shape, gold palette)', () => {
    const c = juliaMorphSchema.parse({})
    expect(c.shape).toBeCloseTo(0.7885)
    expect(c.iterations).toBe(150)
    expect(c.speed).toBeCloseTo(0.14)
    expect(c.colorInside).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
  it('every slider field carries min/max meta', () => {
    const shape = juliaMorphSchema.shape
    for (const key of ['speed', 'view', 'shape', 'iterations', 'bands'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('seed is randomized on fresh load (seedless share links)', () => {
    expect((juliaMorphSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
  })
  it('iterations is an integer within its band', () => {
    expect(() => juliaMorphSchema.parse({ iterations: 150.5 })).toThrow()
    expect(juliaMorphSchema.parse({ iterations: 320 }).iterations).toBe(320)
  })
})

describe('julia-morph presets', () => {
  it('every family preset patch parses against the schema', () => {
    for (const p of familyPresets) expect(() => juliaMorphSchema.parse(p.patch)).not.toThrow()
  })
  it('every color preset supplies three valid hex colors', () => {
    for (const p of colorPresets) {
      for (const key of ['colorA', 'colorB', 'colorInside'] as const) {
        expect(p.patch[key]).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    }
  })
})
