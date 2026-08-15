import { describe, it, expect } from 'vitest'
import { ablationSchema } from './schema'
import { ablationPresets } from './presets'

describe('ablation schema', () => {
  it('parses to a complete default config', () => {
    const cfg = ablationSchema.parse({})
    expect(cfg.palette.length).toBeGreaterThanOrEqual(2)
    expect(cfg.cellSize).toBeGreaterThan(0)
    expect(cfg.capacity).toBeGreaterThan(0)
    expect(cfg.charge).toBeGreaterThan(0)
  })

  it('puts seed in a collapsed Advanced section and randomises it on fresh load', () => {
    const meta = ablationSchema.shape.seed.meta() as Record<string, unknown>
    expect(meta.section).toBe('Advanced')
    expect(meta.collapsed).toBe(true)
    expect(meta.randomizeOnFreshLoad).toBe(true)
    expect(meta.ui).toBe('number')
  })

  it('labels the colour list Palette and the ground Background', () => {
    const pal = ablationSchema.shape.palette.meta() as Record<string, unknown>
    expect(pal.ui).toBe('colorList')
    expect(pal.label).toBe('Palette')
    expect(pal.section).toBe('Color')
    const bg = ablationSchema.shape.background.meta() as Record<string, unknown>
    expect(bg.ui).toBe('color')
    expect(bg.label).toBe('Background')
  })

  it('gives every field a section and every slider explicit bounds', () => {
    for (const [name, field] of Object.entries(ablationSchema.shape)) {
      const meta = (field as { meta(): Record<string, unknown> }).meta()
      expect(meta.section, `${name} needs a section`).toBeTruthy()
      if (meta.ui === 'slider') {
        expect(typeof meta.min, `${name} slider needs min`).toBe('number')
        expect(typeof meta.max, `${name} slider needs max`).toBe('number')
      }
    }
  })

  it('supports a two-colour palette (black and white)', () => {
    const cfg = ablationSchema.parse({ palette: ['#000000', '#ffffff'] })
    expect(cfg.palette).toEqual(['#000000', '#ffffff'])
  })

  it('defaults to an evenly spread crew hunting proportionally', () => {
    const d = ablationSchema.parse({})
    expect(d.spacing).toBe(1)
    expect(d.targetingBias).toBe(1)
    expect(d.targeting).toBe('Mixed')
    expect(d.fleet).toBeGreaterThan(d.capacity)
  })

  it('has no arrivalRate field', () => {
    expect(Object.keys(ablationSchema.shape)).not.toContain('arrivalRate')
  })

  it('rejects an unknown targeting mode', () => {
    expect(ablationSchema.safeParse({ targeting: 'Frenzy' }).success).toBe(false)
  })
})

describe('ablation presets', () => {
  it('declares a Palette axis and a Demolition axis', () => {
    expect(ablationPresets.map((g) => g.label).sort()).toEqual(['Demolition', 'Palette'])
  })

  it('every preset patch parses as a valid config', () => {
    for (const group of ablationPresets) {
      for (const option of group.options) {
        expect(() => ablationSchema.parse({ ...ablationSchema.parse({}), ...option.patch })).not.toThrow()
      }
    }
  })

  it('options within a group all set the same keys (matchPresets assumption)', () => {
    for (const group of ablationPresets) {
      const keys = group.options.map((o) => Object.keys(o.patch).sort().join(','))
      expect(new Set(keys).size).toBe(1)
    }
  })

  it('gives every Demolition option the identical key-set', () => {
    const demolition = ablationPresets.find((g) => g.label === 'Demolition')!
    const keys = demolition.options.map((o) => Object.keys(o.patch).sort().join(','))
    expect(new Set(keys).size).toBe(1)
  })

  it('offers a Unison option in the Demolition group', () => {
    const demolition = ablationPresets.find((g) => g.label === 'Demolition')!
    expect(demolition.options.some((o) => o.patch.targeting === 'Unison')).toBe(true)
  })
})
