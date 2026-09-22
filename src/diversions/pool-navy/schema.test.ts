import { describe, expect, it } from 'vitest'
import { DEFAULTS } from './config'
import { POOLS, poolNavySchema, toSimConfig } from './schema'
import { poolNavyPresets } from './presets'

describe('pool-navy schema', () => {
  it('parses empty and reproduces the simulation defaults', () => {
    const sim = toSimConfig(poolNavySchema.parse({}))
    for (const k of Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>) {
      expect(sim[k], k).toEqual(DEFAULTS[k])
    }
  })

  // ⚠️ seedContract rolls Math.floor(rand() * 1e9) and checks it survives.
  // A .min()/.max() on the seed would reject it.
  it('the seed accepts what a fresh-load roll produces', () => {
    expect(poolNavySchema.parse({ seed: 500_000_000 }).seed).toBe(500_000_000)
  })

  it('the named pool reaches the simulation as real dimensions', () => {
    const sim = toSimConfig(poolNavySchema.parse({ pool: 'olympic' }))
    expect(sim.poolWidthM).toBe(POOLS.olympic.widthM)
    expect(sim.poolHeightM).toBe(POOLS.olympic.heightM)
    expect(sim.poolWidthM).toBeGreaterThan(toSimConfig(poolNavySchema.parse({ pool: 'kiddie' })).poolWidthM)
  })

  it('every pool is landscape, so the letterbox never flips', () => {
    for (const [name, p] of Object.entries(POOLS)) {
      expect(p.widthM, name).toBeGreaterThan(p.heightM)
    }
  })

  it('every preset patch parses cleanly over the defaults', () => {
    const base = poolNavySchema.parse({})
    for (const g of poolNavyPresets) {
      for (const o of g.options) {
        expect(() => poolNavySchema.parse({ ...base, ...o.patch }), `${g.label}/${o.name}`).not.toThrow()
      }
    }
  })

  // presetSweep enforces both of these; failing here is a faster signal.
  it('every group patches ONE key-set and opens on a NAME', () => {
    const base = poolNavySchema.parse({})
    for (const g of poolNavyPresets) {
      const sets = g.options.map((o) => Object.keys(o.patch).sort().join(','))
      expect(new Set(sets).size, `${g.label} options disagree on key-set`).toBe(1)
      const landing = g.options.find((o) =>
        Object.entries(o.patch).every(
          ([k, v]) => JSON.stringify(v) === JSON.stringify(base[k as keyof typeof base]),
        ),
      )
      expect(landing, `${g.label} opens on "Custom"`).toBeDefined()
    }
  })

  it('no field appears in two groups, and no group patches only one', () => {
    const seen = new Set<string>()
    for (const g of poolNavyPresets) {
      const keys = Object.keys(g.options[0]!.patch)
      expect(keys.length, `${g.label} patches a single field`).toBeGreaterThan(1)
      for (const k of keys) {
        expect(seen.has(k), `${k} is in two groups`).toBe(false)
        seen.add(k)
      }
    }
  })

  it('no two options in a group collapse to the same patch', () => {
    for (const g of poolNavyPresets) {
      const seen = g.options.map((o) => JSON.stringify(o.patch))
      expect(new Set(seen).size, `${g.label} has duplicate options`).toBe(g.options.length)
    }
  })
})
