import { describe, it, expect } from 'vitest'
import { goldenApollonianSchema, KALEIDO } from './schema'
import { palettePresets } from './presets'
import { seedOffset } from './index'
import { FRAG_SRC } from './apollian'

describe('goldenApollonianSchema', () => {
  it('parses to defaults (golden ring, full depth, auto kaleidoscope)', () => {
    const c = goldenApollonianSchema.parse({})
    expect(c.speed).toBeCloseTo(1)
    expect(c.depth).toBe(9)
    expect(c.distortion).toBeCloseTo(0.5)
    expect(c.kaleido).toBe('Auto')
    expect(c.ring).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
  it('every slider field carries min/max meta', () => {
    const shape = goldenApollonianSchema.shape
    for (const key of ['speed', 'depth', 'distortion'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('kaleido is a segmented enum; seed is randomized on fresh load', () => {
    expect((goldenApollonianSchema.shape.kaleido as any).meta().ui).toBe('segmented')
    expect(() => goldenApollonianSchema.parse({ kaleido: 'Nope' })).toThrow()
    expect((goldenApollonianSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
    expect(KALEIDO).toContain('Auto')
  })
  it('depth is an integer within its band', () => {
    expect(() => goldenApollonianSchema.parse({ depth: 5.5 })).toThrow()
    expect(goldenApollonianSchema.parse({ depth: 9 }).depth).toBe(9)
  })
})

describe('seedOffset', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(seedOffset(3)).toBe(seedOffset(3))
    expect(seedOffset(3)).not.toBe(seedOffset(4))
    expect(seedOffset(3)).toBeGreaterThanOrEqual(0)
  })
})

describe('golden-apollonian shader', () => {
  it('is a valid #version-300-es frag with a main() invoking the port', () => {
    expect(FRAG_SRC.startsWith('#version 300 es')).toBe(true)
    expect(FRAG_SRC).toContain('void main()')
    expect(FRAG_SRC).toContain('float apollian(')
    expect(FRAG_SRC).toContain('u_time')
  })
})

describe('golden-apollonian presets', () => {
  it('every palette preset patch parses against the schema', () => {
    for (const p of palettePresets) expect(() => goldenApollonianSchema.parse(p.patch)).not.toThrow()
  })
})
