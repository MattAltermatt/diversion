import { describe, it, expect } from 'vitest'
import { listDiversions } from './registry'
import { applyPreset, matchPresets } from './presets'

// Preset SWEEP (#127): presets are declared data on a diversion, applied through
// the same update path as the form. For every diversion that declares presets:
//   - each option's patch parses cleanly when merged over defaults
//   - matchPresets round-trips: applying an option then matching returns THAT
//     option for its group (not "Custom")
//   - every group's options share ONE key-set (matchPresets' equal-key-set
//     assumption — the #125 fix; this should now pass)

const withPresets = listDiversions().filter((d) => d.presets && d.presets.length > 0)

describe('preset sweep — every diversion that declares presets (#127)', () => {
  if (withPresets.length === 0) {
    it('no diversion declares presets yet (sweep is a no-op)', () => {
      expect(withPresets.length).toBe(0)
    })
  }

  for (const d of withPresets) {
    const defaults = d.schema.parse({}) as Record<string, unknown>
    const groups = d.presets!

    it(`${d.id}: every preset patch parses cleanly over defaults`, () => {
      for (const group of groups) {
        for (const opt of group.options) {
          const merged = applyPreset(defaults, opt.patch as Partial<typeof defaults>)
          expect(() => d.schema.parse(merged), `${group.label} / ${opt.name}`).not.toThrow()
        }
      }
    })

    it(`${d.id}: matchPresets round-trips each option's own name`, () => {
      groups.forEach((group, gi) => {
        for (const opt of group.options) {
          const cfg = d.schema.parse(applyPreset(defaults, opt.patch as Partial<typeof defaults>))
          const matched = matchPresets(groups as never, cfg as never)
          expect(matched[gi], `${group.label} / ${opt.name} did not round-trip`).toBe(opt.name)
        }
      })
    })

    it(`${d.id}: every group's options share one key-set`, () => {
      for (const group of groups) {
        const keySets = group.options.map((o) => Object.keys(o.patch).sort().join(','))
        const first = keySets[0]
        for (const ks of keySets) {
          expect(ks, `${group.label} options disagree on key-set`).toBe(first)
        }
      }
    })
  }
})
