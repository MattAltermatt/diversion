import { describe, it, expect } from 'vitest'
import { salvageSchema } from './schema'
import { salvagePresets } from './presets'

describe('salvage schema', () => {
  const d = salvageSchema.parse({})
  it('defaults to the bundled sprites', () => {
    expect(d.source).toBe('Pictures')
    expect(d.image).toBeUndefined()
    expect(d.glyph).toBe('Spider')
  })
  it('caps colours at 12', () => {
    expect(() => salvageSchema.parse({ colors: 13 })).toThrow()
    expect(salvageSchema.parse({ colors: 12 }).colors).toBe(12)
  })
  it('the Calm preset is the defaults, so the group opens on a name', () => {
    const calm = salvagePresets[0].options[0]
    expect(calm.name).toBe('Calm')
    for (const [k, v] of Object.entries(calm.patch)) expect((d as Record<string, unknown>)[k]).toEqual(v)
  })
  it('every Crew option patches the same key set', () => {
    const keys = salvagePresets[0].options.map((o) => Object.keys(o.patch).sort().join())
    expect(new Set(keys).size).toBe(1)
  })
})
