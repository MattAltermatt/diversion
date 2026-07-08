import { describe, it, expect } from 'vitest'
import { fallingSandSchema } from './schema'
import { palettePresets } from './presets'

describe('fallingSandSchema', () => {
  it('parses to defaults', () => {
    const c = fallingSandSchema.parse({})
    expect(c.cellSize).toBe(4)
    expect(c.simSpeed).toBe(60)
    expect(c.emitterCount).toBe(2)
    expect(c.emitRate).toBe(24)
    expect(c.elements).toEqual({ emitSand: true, emitWater: true, emitFire: true, emitPlant: true })
    expect(c.colors.sand).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(c.background).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('every slider field carries min/max meta', () => {
    const shape = fallingSandSchema.shape
    for (const key of ['cellSize', 'simSpeed', 'emitterCount', 'emitRate'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })

  it('seed is randomized on fresh load and collapsed under Advanced', () => {
    const m = (fallingSandSchema.shape.seed as any).meta()
    expect(m.randomizeOnFreshLoad).toBe(true)
    expect(m.section).toBe('Advanced')
    expect(m.collapsed).toBe(true)
  })

  it('element mix and color roles are grouped, not a colorList', () => {
    expect((fallingSandSchema.shape.elements as any).meta().ui).toBe('group')
    expect((fallingSandSchema.shape.colors as any).meta().ui).toBe('group')
  })
})

describe('falling-sand palette presets', () => {
  it('every preset patch parses against the schema', () => {
    for (const p of palettePresets) expect(() => fallingSandSchema.parse(p.patch)).not.toThrow()
  })
  it('every preset keeps at least one element enabled', () => {
    for (const p of palettePresets) {
      const e = p.patch.elements!
      expect(e.emitSand || e.emitWater || e.emitFire || e.emitPlant).toBe(true)
    }
  })
})
