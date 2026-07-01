import { describe, it, expect } from 'vitest'
import { swarmalatorsPresets } from './presets'

describe('swarmalatorsPresets', () => {
  it('exposes one State group with the five canonical states', () => {
    expect(swarmalatorsPresets).toHaveLength(1)
    const group = swarmalatorsPresets[0]
    expect(group.label).toBe('State')
    const byName = Object.fromEntries(group.options.map((o) => [o.name, o.patch]))
    expect(byName['Active phase wave']).toMatchObject({ J: 1, K: -0.75 })
    expect(byName['Splintered phase wave']).toMatchObject({ J: 1, K: -0.1 })
    expect(byName['Static phase wave']).toMatchObject({ J: 1, K: 0 })
    expect(byName['Static sync']).toMatchObject({ J: 0.1, K: 1 })
    expect(byName['Static async']).toMatchObject({ J: 0.1, K: -1 })
  })
  it('every option resets shimmer to 0 (pure canonical states)', () => {
    for (const o of swarmalatorsPresets[0].options) expect(o.patch.omegaSpread).toBe(0)
  })
})
