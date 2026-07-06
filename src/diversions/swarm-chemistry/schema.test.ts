import { describe, it, expect } from 'vitest'
import { swarmChemistrySchema } from './schema'
import { swarmChemistryPresets } from './presets'
import { SEED_NAMES } from './recipes'
import { COMPETITIONS } from './pack'

describe('swarm-chemistry schema', () => {
  it('parses defaults; seed population and competition are valid', () => {
    const cfg = swarmChemistrySchema.parse({})
    expect(SEED_NAMES).toContain(cfg.recipe)
    expect(COMPETITIONS).toContain(cfg.competition)
    expect(cfg.evolve).toBe(true)
    expect(cfg.count).toBeGreaterThan(0)
  })

  it('seed field follows canon (Advanced, collapsed, randomizeOnFreshLoad)', () => {
    const meta = swarmChemistrySchema.shape.seed.meta() as Record<string, unknown>
    expect(meta.label).toBe('Seed')
    expect(meta.ui).toBe('number')
    expect(meta.section).toBe('Advanced')
    expect(meta.collapsed).toBe(true)
    expect(meta.randomizeOnFreshLoad).toBe(true)
  })

  it('rejects a bad seed population and a non-hex background', () => {
    expect(swarmChemistrySchema.safeParse({ recipe: 'Not A Recipe' }).success).toBe(false)
    expect(swarmChemistrySchema.safeParse({ background: 'nope' }).success).toBe(false)
    expect(swarmChemistrySchema.safeParse({ competition: 'Nonsense' }).success).toBe(false)
  })
})

describe('swarm-chemistry presets', () => {
  it('every group option patches parse cleanly on top of defaults', () => {
    const defaults = swarmChemistrySchema.parse({})
    for (const group of swarmChemistryPresets) {
      for (const opt of group.options) {
        const merged = swarmChemistrySchema.parse({ ...defaults, ...opt.patch })
        expect(merged.count).toBeGreaterThan(0)
      }
    }
  })

  it('each group patches a consistent key-set (matchPresets assumption)', () => {
    for (const group of swarmChemistryPresets) {
      const keys = group.options.map((o) => Object.keys(o.patch).sort().join(','))
      expect(new Set(keys).size).toBe(1)
    }
  })
})
