import { describe, it, expect } from 'vitest'
import { quasicrystalSchema } from './schema'
import { symmetryPresets, colorPresets } from './presets'

describe('quasicrystalSchema', () => {
  it('parses to defaults (7 waves, Aurora duotone)', () => {
    const c = quasicrystalSchema.parse({})
    expect(c.waves).toBe(7)
    expect(c.scale).toBe(22)
    expect(c.speed).toBeCloseTo(0.4)
    expect(c.colorA).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(c.colorB).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
  it('every slider field carries min/max meta', () => {
    const shape = quasicrystalSchema.shape
    for (const key of ['waves', 'scale', 'fringes', 'speed'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('seed is randomized on fresh load (seedless share links)', () => {
    expect((quasicrystalSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
  })
  it('waves is an integer within its band', () => {
    expect(() => quasicrystalSchema.parse({ waves: 7.5 })).toThrow()
    expect(quasicrystalSchema.parse({ waves: 12 }).waves).toBe(12)
  })
})

describe('quasicrystal presets', () => {
  it('every symmetry preset patch parses against the schema', () => {
    for (const p of symmetryPresets) expect(() => quasicrystalSchema.parse(p.patch)).not.toThrow()
  })
  it('every color preset supplies two valid hex colors', () => {
    for (const p of colorPresets) {
      expect(p.patch.colorA).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(p.patch.colorB).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})
