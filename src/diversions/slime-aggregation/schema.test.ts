import { describe, it, expect } from 'vitest'
import { slimeAggregationSchema } from './schema'
import { patternPresets, colorPresets } from './presets'

describe('slimeAggregationSchema', () => {
  it('parses to sane defaults', () => {
    const cfg = slimeAggregationSchema.parse({})
    expect(cfg.agentCount).toBeGreaterThan(0)
    expect(cfg.pacemakerCount).toBeGreaterThan(0)
    expect(cfg.palette.length).toBeGreaterThanOrEqual(2)
  })

  it('every slider field carries min/max meta', () => {
    const shape = slimeAggregationSchema.shape
    for (const key of [
      'cellSize', 'waveSpeed', 'excitability', 'waveWidth', 'recoveryTime',
      'pacemakerCount', 'agentCount', 'chemotaxisStrength', 'trailPersistence', 'contrast',
    ] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })

  it('seed is randomized on fresh load, lives in Advanced, and starts collapsed (seed contract)', () => {
    const m = (slimeAggregationSchema.shape.seed as any).meta()
    expect(m.randomizeOnFreshLoad).toBe(true)
    expect(m.section).toBe('Advanced')
    expect(m.collapsed).toBe(true)
    expect(m.label).toBe('Seed')
  })

  it('the palette is a colorList named "Palette" under section Color (canon)', () => {
    const m = (slimeAggregationSchema.shape.palette as any).meta()
    expect(m.ui).toBe('colorList')
    expect(m.section).toBe('Color')
    expect(m.label).toBe('Palette')
  })

  it('rejects out-of-band values', () => {
    expect(() => slimeAggregationSchema.parse({ excitability: 1.5 })).toThrow()
    expect(() => slimeAggregationSchema.parse({ agentCount: 100 })).toThrow() // below min 200
    expect(() => slimeAggregationSchema.parse({ pacemakerCount: 0 })).toThrow() // below min 1
  })
})

describe('slime-aggregation presets', () => {
  it('every pattern preset patch parses against the schema', () => {
    for (const p of patternPresets) {
      expect(() => slimeAggregationSchema.parse(p.patch)).not.toThrow()
    }
  })
  it('every palette preset supplies valid hex stops + a stream color', () => {
    for (const p of colorPresets) {
      expect(() => slimeAggregationSchema.parse(p.patch)).not.toThrow()
      expect(p.patch.palette!.length).toBeGreaterThanOrEqual(2)
      for (const s of p.patch.palette!) expect(s).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})
