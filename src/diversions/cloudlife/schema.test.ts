import { describe, it, expect } from 'vitest'
import { cloudlifeSchema } from './schema'
import { cloudPresets, colorPresets } from './presets'

describe('cloudlifeSchema', () => {
  it('parses to defaults', () => {
    const c = cloudlifeSchema.parse({})
    expect(c.maxAge).toBe(64)
    expect(c.speed).toBe(22)
    expect(c.cellSize).toBe(6)
    expect(c.initialDensity).toBeCloseTo(0.42)
    expect(c.palette.length).toBeGreaterThanOrEqual(2)
    expect(c.background).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('every slider field carries min/max meta', () => {
    const shape = cloudlifeSchema.shape
    for (const key of ['maxAge', 'initialDensity', 'speed', 'cellSize'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })

  it('maxAge stays below the unsigned-char rule ceiling (< 256), per the source', () => {
    const m = (cloudlifeSchema.shape.maxAge as any).meta()
    expect(m.max).toBeLessThan(256)
  })

  it('palette is a colorList named Palette (schema UX canon)', () => {
    const m = (cloudlifeSchema.shape.palette as any).meta()
    expect(m.ui).toBe('colorList')
    expect(m.label).toBe('Palette')
    expect(m.section).toBe('Color')
  })

  it('background is a dark color field under Color', () => {
    const m = (cloudlifeSchema.shape.background as any).meta()
    expect(m.ui).toBe('color')
    expect(m.label).toBe('Background')
    expect(m.section).toBe('Color')
    const c = cloudlifeSchema.parse({}).background
    // crude "dark" check: luminance well below mid-grey
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16)
    expect((r + g + b) / 3).toBeLessThan(60)
  })

  it('seed is in Advanced, collapsed, and randomized on fresh load (seedless share links)', () => {
    const m = (cloudlifeSchema.shape.seed as any).meta()
    expect(m.section).toBe('Advanced')
    expect(m.collapsed).toBe(true)
    expect(m.randomizeOnFreshLoad).toBe(true)
  })
})

describe('cloudlife presets', () => {
  it('every cloud preset patch parses against the schema', () => {
    for (const p of cloudPresets) expect(() => cloudlifeSchema.parse(p.patch)).not.toThrow()
  })
  it('every palette preset supplies valid hex palette + background', () => {
    for (const p of colorPresets) {
      expect(p.patch.palette.length).toBeGreaterThanOrEqual(2)
      for (const s of p.patch.palette) expect(s).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(p.patch.background).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})
