import { describe, it, expect } from 'vitest'
import { applyPreset, deepEqual, matchPresets } from './presets'
import type { PresetGroup } from './types'
import { allDiversionEntries } from './testRegistry'
import { applyFreshLoadRandomization, freshLoadKeys } from './urlCodec'

type Cfg = {
  speed: number
  particles: number
  background: string
  color: { mode: string; colors: string[] }
}

const base: Cfg = {
  speed: 0.3,
  particles: 7300,
  background: '#0a0a12',
  color: { mode: 'palette', colors: ['#aaa', '#bbb'] },
}

describe('applyPreset', () => {
  it('overrides flat fields and leaves the rest untouched', () => {
    const next = applyPreset(base, { speed: 0.7 })
    expect(next.speed).toBe(0.7)
    expect(next.particles).toBe(7300)
    expect(next.color).toBe(base.color) // untouched fields keep identity
  })

  it('replaces a nested object wholesale (no deep merge)', () => {
    const next = applyPreset(base, { color: { mode: 'gradient', colors: ['#fff'] } })
    expect(next.color).toEqual({ mode: 'gradient', colors: ['#fff'] })
  })

  it('does not mutate the input config', () => {
    applyPreset(base, { speed: 0.9 })
    expect(base.speed).toBe(0.3)
  })
})

describe('deepEqual', () => {
  it('compares primitives, arrays, and nested objects', () => {
    expect(deepEqual(1, 1)).toBe(true)
    expect(deepEqual('#fff', '#fff')).toBe(true)
    expect(deepEqual(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(deepEqual(['a', 'b'], ['a', 'c'])).toBe(false)
    expect(deepEqual({ x: [1, 2] }, { x: [1, 2] })).toBe(true)
    expect(deepEqual({ x: [1, 2] }, { x: [1, 3] })).toBe(false)
    expect(deepEqual(['a'], ['a', 'b'])).toBe(false) // length differs
  })
})

describe('matchPresets', () => {
  const groups: PresetGroup<Cfg>[] = [
    {
      label: 'Speed',
      options: [
        { name: 'Slow', patch: { speed: 0.3 } },
        { name: 'Fast', patch: { speed: 0.9 } },
      ],
    },
    {
      label: 'Color',
      options: [
        { name: 'Mono', patch: { background: '#0a0a12', color: { mode: 'palette', colors: ['#aaa', '#bbb'] } } },
        { name: 'Neon', patch: { background: '#000', color: { mode: 'palette', colors: ['#0ff'] } } },
      ],
    },
  ]

  it('returns the matching option name per group', () => {
    expect(matchPresets(groups, base)).toEqual(['Slow', 'Mono'])
  })

  it('returns null for a group when a single patched field differs', () => {
    expect(matchPresets(groups, { ...base, speed: 0.5 })).toEqual([null, 'Mono'])
  })

  it('detects a nested color-array difference', () => {
    const tweaked = { ...base, color: { mode: 'palette', colors: ['#aaa', '#ccc'] } }
    expect(matchPresets(groups, tweaked)).toEqual(['Slow', null])
  })

  it('resolves the two groups independently', () => {
    const fastNeon = applyPreset(applyPreset(base, { speed: 0.9 }), {
      background: '#000',
      color: { mode: 'palette', colors: ['#0ff'] },
    })
    expect(matchPresets(groups, fastNeon)).toEqual(['Fast', 'Neon'])
  })
})

describe('#305 — matchPresets ignores pin-only (randomizeOnFreshLoad) keys', () => {
  type SeededCfg = { map: string; seed: number; background: string }
  const seeded: PresetGroup<SeededCfg>[] = [
    {
      label: 'Attractor',
      options: [
        { name: 'Martin (sqrt)', patch: { map: 'martin', seed: 7 } },
        { name: 'Sine cousin', patch: { map: 'sine', seed: 7 } },
      ],
    },
  ]
  const PINNED = new Set(['seed'])
  // What the route actually hands the picker: the seed has already been re-rolled by
  // applyFreshLoadRandomization, so it never equals the patch's 7.
  const asLoaded: SeededCfg = { map: 'martin', seed: 861_204_337, background: '#000' }

  it('matches on the non-pinned keys even though the seed was re-rolled', () => {
    expect(matchPresets(seeded, asLoaded, PINNED)).toEqual(['Martin (sqrt)'])
  })

  it('without the ignore set it reads Custom — the bug, and the unchanged default', () => {
    expect(matchPresets(seeded, asLoaded)).toEqual([null])
    expect(matchPresets(seeded, asLoaded, new Set())).toEqual([null])
  })

  it('still reads Custom when a NON-pinned key genuinely drifted', () => {
    const drifted = { ...asLoaded, map: 'rr' }
    expect(matchPresets(seeded, drifted, PINNED)).toEqual([null])
  })

  it('still picks the right sibling option (ignoring the seed is not "match anything")', () => {
    expect(matchPresets(seeded, { ...asLoaded, map: 'sine' }, PINNED)).toEqual(['Sine cousin'])
  })

  it('a group whose patch is ONLY pinned keys reads Custom, not its first option', () => {
    // Every key ignored would make `.every()` vacuously true and pin the first option
    // as "selected" against any config at all — a silent lie. Custom is honest.
    const seedOnly: PresetGroup<SeededCfg>[] = [
      {
        label: 'World',
        options: [
          { name: 'World A', patch: { seed: 1 } },
          { name: 'World B', patch: { seed: 2 } },
        ],
      },
    ]
    expect(matchPresets(seedOnly, asLoaded, PINNED)).toEqual([null])
  })

  it('an ignore key absent from every patch changes nothing', () => {
    const exact: SeededCfg = { map: 'martin', seed: 7, background: '#000' }
    expect(matchPresets(seeded, exact, new Set(['nonexistent']))).toEqual(['Martin (sqrt)'])
  })
})

describe('#305 — the three real diversions whose named presets read "Custom"', () => {
  // The regression the sweep at presetSweep.test.ts could not see: it builds its
  // config as schema.parse(applyPreset(defaults, patch)) and never runs the route's
  // own derivation, so it tests a config the Config screen can never actually hold.
  // These cases run applyFreshLoadRandomization first, exactly as PlayScreen and
  // ConfigScreen do, and only then ask the picker what it would display.
  const cases: [slug: string, group: string, option: string][] = [
    ['hopalong', 'Attractor', 'Martin (sqrt)'],
    ['strange-attractors', 'Attractor', 'Clifford'],
    ['thornbird', 'Shape', 'Classic Bird'],
  ]

  for (const [slug, groupLabel, optionName] of cases) {
    it(`${slug}: reports "${optionName}" at its own defaults, not Custom`, () => {
      const d = allDiversionEntries.find(([s]) => s === slug)?.[1]
      expect(d, `${slug} missing from the registry`).toBeTruthy()
      const groups = d!.presets!
      const gi = groups.findIndex((g) => g.label === groupLabel)
      expect(gi, `${slug} has no "${groupLabel}" group`).toBeGreaterThanOrEqual(0)
      expect(
        groups[gi].options.some((o) => o.name === optionName),
        `${slug}/${groupLabel} has no "${optionName}" option`,
      ).toBe(true)

      // A shared link is seedless (encodeConfig never emits a pin-only field), so a
      // fresh visit rolls a new seed. Force a value that is NOT the patch's 7.
      const defaults = d!.schema.parse({}) as Record<string, unknown>
      const loaded = applyFreshLoadRandomization(
        d!.schema,
        defaults as never,
        new URLSearchParams(),
        () => 0.123456,
      ) as Record<string, unknown>
      expect(loaded.seed, 'the seed must actually have been re-rolled').not.toBe(defaults.seed)

      const pinned = freshLoadKeys(d!.schema)
      expect(pinned.has('seed'), `${slug}'s seed is not flagged randomizeOnFreshLoad`).toBe(true)
      expect(matchPresets(groups as never, loaded as never, pinned)[gi]).toBe(optionName)
    })
  }
})
