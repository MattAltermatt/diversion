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
  const group = (label: string) => salvagePresets.find((g) => g.label === label)!
  it('the Calm preset is the defaults, so the group opens on a name', () => {
    const calm = group('Crew').options[0]
    expect(calm.name).toBe('Calm')
    for (const [k, v] of Object.entries(calm.patch)) expect((d as Record<string, unknown>)[k]).toEqual(v)
  })
  it('the Bathymetric palette is the default ramp, so that group opens on a name too', () => {
    const bathy = group('Palette').options[0]
    expect(bathy.name).toBe('Bathymetric')
    expect(bathy.patch.palette).toEqual(d.palette)
  })
  it('every option in a group patches the same key set', () => {
    for (const g of salvagePresets) {
      const keys = g.options.map((o) => Object.keys(o.patch).sort().join())
      expect(new Set(keys).size, g.label).toBe(1)
    }
  })
  it('Palette presets patch only the ramp — never source, or the group would read Custom at defaults', () => {
    for (const o of group('Palette').options) expect(Object.keys(o.patch)).toEqual(['palette'])
  })
})
