import { describe, it, expect } from 'vitest'
import { voronoiSchema, FILL_MODES } from './schema'
import { palettePresets } from './presets'

describe('voronoiSchema', () => {
  it('parses to defaults (150 sites, site fill mode)', () => {
    const c = voronoiSchema.parse({})
    expect(c.siteCount).toBe(150)
    expect(c.fillMode).toBe('site')
    expect(c.driftSpeed).toBeCloseTo(0.5)
    expect(c.driftRadius).toBeCloseTo(0.22)
    expect(c.palette.length).toBeGreaterThanOrEqual(2)
  })

  it('every slider field carries min/max meta', () => {
    const shape = voronoiSchema.shape
    for (const key of ['siteCount', 'driftSpeed', 'driftRadius', 'edgeWidth'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })

  it('fillMode is a select with the three declared options', () => {
    const m = (voronoiSchema.shape.fillMode as any).meta()
    expect(m.ui).toBe('select')
    expect(m.options).toEqual([...FILL_MODES])
  })

  it('seed is randomized on fresh load (seedless share links) and sits in a collapsed Advanced section', () => {
    const m = (voronoiSchema.shape.seed as any).meta()
    expect(m.randomizeOnFreshLoad).toBe(true)
    expect(m.section).toBe('Advanced')
    expect(m.collapsed).toBe(true)
  })

  it('siteCount is an integer within its band', () => {
    expect(() => voronoiSchema.parse({ siteCount: 150.5 })).toThrow()
    expect(voronoiSchema.parse({ siteCount: 400 }).siteCount).toBe(400)
  })
})

describe('voronoi presets', () => {
  it('every palette preset patch parses against the schema', () => {
    for (const p of palettePresets) expect(() => voronoiSchema.parse(p.patch)).not.toThrow()
  })
})
