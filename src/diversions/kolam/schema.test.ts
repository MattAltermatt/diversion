import { describe, it, expect } from 'vitest'
import { kolamSchema } from './schema'
import { kolamPresets } from './presets'
import { DEFAULTS } from './config'

describe('schema', () => {
  it('parses empty to exactly DEFAULTS', () => {
    expect(kolamSchema.parse({})).toEqual(DEFAULTS)
  })

  // ⚠️ Non-vacuity FIRST — all three tests below iterate `kolamPresets`, so an
  // empty or single-group array passes every one of them.
  it('ships exactly two groups, each with options', () => {
    expect(kolamPresets).toHaveLength(2)
    for (const g of kolamPresets) expect(g.options.length).toBeGreaterThanOrEqual(2)
  })

  it('every preset option patches MORE THAN ONE field (#363)', () => {
    for (const g of kolamPresets) {
      for (const o of g.options) expect(Object.keys(o.patch).length).toBeGreaterThan(1)
    }
  })

  // ⚠️ Two groups that both patch `palette` mean picking a Ground silently flips
  // the Palette dropdown to Custom — the #311 failure. presetSweep.test.ts does
  // NOT catch it (it only round-trips each group against itself).
  it('preset groups are INDEPENDENT axes — no field appears in two groups', () => {
    const seen = new Map<string, string>()
    for (const g of kolamPresets) {
      for (const k of new Set(g.options.flatMap((o) => Object.keys(o.patch)))) {
        expect(seen.get(k), `${k} is patched by both ${seen.get(k)} and ${g.label}`).toBeUndefined()
        seen.set(k, g.label)
      }
    }
  })
})
