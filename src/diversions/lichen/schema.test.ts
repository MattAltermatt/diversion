import { describe, expect, it } from 'vitest'
import { lichenSchema } from './schema'
import { SPECIES } from './species'

// These re-run the canon locally rather than leaning on the repo-wide sweeps. That was
// originally because the sweeps iterate the eager glob of */index.ts, which did not exist
// while this file was being written — they now do cover this schema, since index.ts landed.
// Kept anyway: a local failure names the field, where a sweep failure names the sweep.

const shape = lichenSchema.shape as Record<string, { meta: () => Record<string, unknown> }>

describe('the schema parses and defaults', () => {
  it('parses an empty object deterministically', () => {
    const a = lichenSchema.parse({})
    const b = lichenSchema.parse({})
    expect(a).toEqual(b)
    expect(a.seed).toBe(1) // a literal default; freshness comes from the route layer
  })

  it('puts every default inside its own declared bounds', () => {
    const cfg = lichenSchema.parse({}) as Record<string, unknown>
    for (const [key, field] of Object.entries(shape)) {
      const meta = field.meta() ?? {}
      if (meta.ui !== 'slider') continue
      const v = cfg[key] as number
      expect(typeof v, key).toBe('number')
      expect(v, `${key} below min`).toBeGreaterThanOrEqual(meta.min as number)
      expect(v, `${key} above max`).toBeLessThanOrEqual(meta.max as number)
    }
  })
})

describe('canon', () => {
  it('gives every slider a min, max AND step', () => {
    // diversionMeta requires `step`; Slider otherwise falls back to 1, which is unusable
    // for exposure and relief.
    for (const [key, field] of Object.entries(shape)) {
      const meta = field.meta() ?? {}
      if (meta.ui !== 'slider') continue
      expect(typeof meta.min, `${key}.min`).toBe('number')
      expect(typeof meta.max, `${key}.max`).toBe('number')
      expect(typeof meta.step, `${key}.step`).toBe('number')
    }
  })

  it('declares the seed the way seedContract requires', () => {
    const meta = shape.seed.meta()
    expect(meta.ui).toBe('number')
    expect(meta.label).toBe('Seed')
    expect(meta.section).toBe('Advanced')
    expect(meta.collapsed).toBe(true)
    expect(meta.randomizeOnFreshLoad).toBe(true)
  })

  it('has no background field, and exposes the two grounds that do show', () => {
    expect(shape.background).toBeUndefined()
    expect(shape.rock.meta().ui).toBe('color')
    expect(shape.sea.meta().ui).toBe('color')
  })

  it('carries help on every non-obvious field', () => {
    const obvious = new Set(['species', 'sea'])
    for (const [key, field] of Object.entries(shape)) {
      if (obvious.has(key)) continue
      expect(typeof field.meta().help, `${key} has no help`).toBe('string')
    }
  })
})

describe('species colours', () => {
  it('has one colour per species, in the same order as SPECIES', () => {
    // The order is what maps a colour to an organism. A silent mismatch paints the
    // near-black fringe species up in the dry zone and nothing else notices.
    const group = lichenSchema.parse({}).species
    const keys = Object.keys(group)
    expect(keys).toHaveLength(SPECIES.length)
    expect(keys).toEqual(SPECIES.map(s => s.short.toLowerCase()))
  })

  it('renders as a group of discrete colours, not a colorList', () => {
    expect(shape.species.meta().ui).toBe('group')
    expect(shape.species.meta().section).toBe('Color')
  })
})
