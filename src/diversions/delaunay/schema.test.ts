import { describe, it, expect } from 'vitest'
import { delaunayMeshSchema } from './schema'
import { palettePresets } from './presets'

describe('delaunayMeshSchema', () => {
  it('parses to defaults (60 points, filled mode, crystal palette)', () => {
    const c = delaunayMeshSchema.parse({})
    expect(c.count).toBe(60)
    expect(c.mode).toBe('filled')
    expect(c.driftSpeed).toBeCloseTo(0.4)
    expect(c.palette.length).toBeGreaterThanOrEqual(2)
  })

  it('every slider field carries min/max meta', () => {
    const shape = delaunayMeshSchema.shape
    for (const key of ['count', 'driftSpeed', 'edgeThickness'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })

  it('seed is randomized on fresh load (seedless share links)', () => {
    expect((delaunayMeshSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
  })

  it('mode segmented options mirror the enum', () => {
    const m = (delaunayMeshSchema.shape.mode as any).meta()
    expect(m.ui).toBe('segmented')
    expect(m.options).toEqual(['filled', 'mesh', 'both'])
  })

  it('count is an integer within its band', () => {
    expect(() => delaunayMeshSchema.parse({ count: 60.5 })).toThrow()
    expect(delaunayMeshSchema.parse({ count: 150 }).count).toBe(150)
  })
})

describe('delaunay palette presets', () => {
  it('every palette preset patch parses against the schema', () => {
    for (const p of palettePresets) expect(() => delaunayMeshSchema.parse(p.patch)).not.toThrow()
  })
})
