import { describe, it, expect } from 'vitest'
import { lloydRelaxationSchema } from './schema'
import { palettePresets } from './presets'

describe('lloydRelaxationSchema', () => {
  it('parses to defaults (360 cells, iridescent palette)', () => {
    const c = lloydRelaxationSchema.parse({})
    expect(c.count).toBe(360)
    expect(c.relaxRate).toBeCloseTo(0.1)
    expect(c.jitter).toBeCloseTo(0.7)
    expect(c.palette.length).toBeGreaterThanOrEqual(2)
  })
  it('every slider field carries min/max meta', () => {
    const shape = lloydRelaxationSchema.shape
    for (const key of ['count', 'relaxRate', 'jitter', 'borderWidth'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('seed is randomized on fresh load (seedless share links)', () => {
    expect((lloydRelaxationSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
  })
  it('count is an integer within its band', () => {
    expect(() => lloydRelaxationSchema.parse({ count: 360.5 })).toThrow()
    expect(lloydRelaxationSchema.parse({ count: 1000 }).count).toBe(1000)
  })
})

describe('lloyd-relaxation presets', () => {
  it('every palette preset patch parses against the schema', () => {
    for (const p of palettePresets) expect(() => lloydRelaxationSchema.parse(p.patch)).not.toThrow()
  })
})
