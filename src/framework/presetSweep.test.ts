import { describe, it, expect } from 'vitest'
import { allDiversions } from './testRegistry'
import { applyPreset, matchPresets } from './presets'
import { freshLoadKeys } from './urlCodec'

// Preset SWEEP (#127): presets are declared data on a diversion, applied through
// the same update path as the form. For every diversion that declares presets:
//   - each option's patch parses cleanly when merged over defaults
//   - matchPresets round-trips: applying an option then matching returns THAT
//     option for its group (not "Custom")
//   - every group's options share ONE key-set (matchPresets' equal-key-set
//     assumption — the #125 fix; this should now pass)

const withPresets = allDiversions.filter((d) => d.presets && d.presets.length > 0)

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

    // Run the production derivation, not a simplified one: PresetPicker calls
    // matchPresets(groups, value, freshLoadKeys(schema)). Omitting the ignore set here
    // is exactly why this sweep never saw #305 — it compared a shape the Config screen
    // can never hold.
    const ignore = freshLoadKeys(d.schema)

    it(`${d.id}: matchPresets round-trips each option's own name`, () => {
      groups.forEach((group, gi) => {
        for (const opt of group.options) {
          const cfg = d.schema.parse(applyPreset(defaults, opt.patch as Partial<typeof defaults>))
          const matched = matchPresets(groups as never, cfg as never, ignore)
          expect(matched[gi], `${group.label} / ${opt.name} did not round-trip`).toBe(opt.name)
        }
      })
    })

    // The class #305's ignore set introduces: two options in one group whose patches
    // differ ONLY in pin-only keys are now indistinguishable, and `Array.find` returns
    // the first — so picking option B would display option A's name forever. Zero
    // collisions in the gallery today; this is what stops the next one landing silently.
    it(`${d.id}: no two options in a group collapse once pin-only keys are ignored`, () => {
      for (const group of groups) {
        const seen = new Map<string, string>()
        for (const opt of group.options) {
          const sig = JSON.stringify(
            Object.entries(opt.patch as Record<string, unknown>)
              .filter(([k]) => !ignore.has(k))
              .sort(([a], [b]) => a.localeCompare(b)),
          )
          const clash = seen.get(sig)
          expect(
            clash,
            `${group.label}: "${opt.name}" and "${clash}" are identical apart from pin-only fields, so only the first is ever selectable`,
          ).toBeUndefined()
          seen.set(sig, opt.name)
        }
      }
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

// OPENS-ON-A-NAME SWEEP (#311). The picker's job is to say *where you are*, and 24 of
// 184 groups opened on "Custom" against an untouched default config — telling you that
// you had drifted off the presets before you touched anything. Eight of those differed
// from a named option in exactly ONE key: the signature of a tuning change that moved a
// default and left the preset behind. Those eight are fixed; this stops the next one.
//
// Note what this compares. `matchPresets` is given `freshLoadKeys` exactly as
// PresetPicker gives it, so a pin-only seed is excluded — that half is #305, and
// omitting it here would re-report those three diversions forever.
//
// The remaining unmatched groups are listed rather than skipped, on the same principle
// `check-cache-lanes.mjs` uses for its UNCACHED rules: a deliberate omission is declared
// with a reason, and a declaration that no longer applies is itself a failure. So
// resolving one of these means DELETING its line, not editing it — and a new diversion
// whose defaults match no preset fails until someone writes down why.
const UNMATCHED_AT_DEFAULTS: Record<string, string> = {
  'ant-colony / Scene': 'default differs from nearest ("Single hive") in 2 of 5 keys',
  // These four differ in EVERY key from every option, so no option is "nearest" —
  // the default is its own composition rather than a drifted preset.
  'aurora / Activity': 'default differs from every option in all 4 keys',
  'boids / Flock': 'default differs from every option in all 5 keys',
  'boxfit / Style': 'default differs from nearest ("Mondrian") in 4 of 6 keys',
  'cynosure / Motion': 'default differs from nearest ("Meditative") in 2 of 3 keys',
  'differential-growth / Growth': 'default differs from nearest ("Coral") in 3 of 7 keys',
  'hextrail / Pace': 'default differs from nearest ("Zen") in 4 of 6 keys',
  'kuramoto / Regime': 'default differs from every option in all 2 keys',
  'logarithmic-circles / Motion': 'default differs from nearest ("Calm") in 2 of 3 keys',
  'mccabe / Pattern': 'default differs from nearest ("Fingerprint") in 2 of 2 keys',
  'morphogen / Body plan': 'default differs from nearest ("Territories") in 4 of 12 keys',
  'outbreak / Scenario': 'default differs from nearest ("Standoff") in 4 of 8 keys',
  'percolation / Sweep': 'default differs from nearest ("Rising Tide") in 2 of 5 keys',
  'raymarcher / Form': 'default differs from every option in all 3 keys',
  'sugarscape / Scene': 'default differs from nearest ("Two mountains") in 2 of 4 keys',
  'vicsek / Dynamics': 'default differs from nearest ("Critical Edge") in 2 of 3 keys',
}

describe('preset sweep — the Config screen opens on a name, not "Custom" (#311)', () => {
  const unmatched = new Set<string>()

  for (const d of withPresets) {
    const groups = d.presets!
    const defaults = d.schema.parse({}) as Record<string, unknown>
    const matched = matchPresets(groups as never, defaults as never, freshLoadKeys(d.schema))

    groups.forEach((group, gi) => {
      const key = `${d.id} / ${group.label}`
      if (matched[gi] === null) unmatched.add(key)

      it(`${key}: opens on a named option at defaults`, () => {
        if (Object.prototype.hasOwnProperty.call(UNMATCHED_AT_DEFAULTS, key)) {
          expect(
            matched[gi],
            `${key} is declared as deliberately unmatched (${UNMATCHED_AT_DEFAULTS[key]}) but now matches "${matched[gi]}" — delete its UNMATCHED_AT_DEFAULTS line`,
          ).toBeNull()
          return
        }
        expect(
          matched[gi],
          `${key} opens on "Custom": the untouched default config matches none of its options. ` +
            `Either move the default onto a preset, move the preset onto the default, or add a ` +
            `named option for the default — then, if the drift is deliberate, declare it in ` +
            `UNMATCHED_AT_DEFAULTS with a reason.`,
        ).not.toBeNull()
      })
    })
  }

  // A declaration for a group that does not exist is dead weight that reads as coverage.
  it('every UNMATCHED_AT_DEFAULTS key names a real preset group', () => {
    const all = new Set(
      withPresets.flatMap((d) => d.presets!.map((g) => `${d.id} / ${g.label}`)),
    )
    for (const key of Object.keys(UNMATCHED_AT_DEFAULTS)) {
      expect(all.has(key), `UNMATCHED_AT_DEFAULTS names "${key}", which is not a preset group`).toBe(true)
    }
  })

  // Non-vacuity, and it must be MONOTONE against the live population rather than a
  // loose floor. A slack threshold protects only the groups named above: every group
  // that currently matches is guarded by this number alone, so at `> 50` a diversion
  // could lose its presets entirely — the Config screen silently dropping both its
  // dropdowns — and this sweep would pass with 588 green cases. Measured, not theorized.
  // Stated as >= the current population so any loss fails, while growth needs no edit.
  it('sweeps the whole gallery', () => {
    const groupCount = withPresets.reduce((n, d) => n + d.presets!.length, 0)
    expect(withPresets.length).toBeGreaterThanOrEqual(102)
    expect(groupCount).toBeGreaterThanOrEqual(184)
    expect(unmatched.size).toBe(Object.keys(UNMATCHED_AT_DEFAULTS).length)
  })
})
