import { describe, it, expect } from 'vitest'
import { shapePresets, stylePresets } from './presets'
import { substrateSchema } from './schema'

describe('substrate presets (#323)', () => {
  it('Shape fronts the Straight % slider: Lines 100 / Classic 80 / Half & half 50 / Circles 0', () => {
    expect(shapePresets.options.map((o) => [o.name, o.patch.straightPct])).toEqual([
      ['Lines', 100], ['Classic', 80], ['Half & half', 50], ['Circles', 0],
    ])
  })
  it('every Style option sets exactly orientation + origin + startDelay, and Classic is the default', () => {
    const d = substrateSchema.parse({})
    for (const o of stylePresets.options) {
      expect(Object.keys(o.patch).sort()).toEqual(['orientation', 'origin', 'startDelay'])
    }
    const classic = stylePresets.options.find((o) => o.name === 'Classic')!
    expect(classic.patch).toEqual({ orientation: d.orientation, origin: d.origin, startDelay: d.startDelay })
  })
})
