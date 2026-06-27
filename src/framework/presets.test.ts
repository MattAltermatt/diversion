import { describe, it, expect } from 'vitest'
import { applyPreset, deepEqual, matchPresets } from './presets'
import type { PresetGroup } from './types'

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
