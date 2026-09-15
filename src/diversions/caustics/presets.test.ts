import { describe, it, expect } from 'vitest'
import { waterPresets, palettePresets } from './presets'
import { causticsSchema } from './schema'
import { readMeta } from '../../framework/fieldMeta'

const relLum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contrast = (a: string, b: string) => {
  const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe('caustics presets', () => {
  it('both groups match the shipped defaults exactly (#311)', () => {
    const d = causticsSchema.parse({}) as Record<string, unknown>
    const matches = (patch: Record<string, unknown>) =>
      Object.entries(patch).every(([k, v]) => JSON.stringify(d[k]) === JSON.stringify(v))
    expect(waterPresets.some((p) => matches(p.patch as Record<string, unknown>)),
      'no Water preset opens on a name at defaults').toBe(true)
    expect(palettePresets.some((p) => matches(p.patch as Record<string, unknown>)),
      'no Palette preset opens on a name at defaults').toBe(true)
  })

  // matchPresets assumes an equal key-set per group -- a group whose options name
  // different fields reads "Custom" against everything.
  it('each group names the same fields in every option', () => {
    for (const group of [waterPresets, palettePresets]) {
      const keys = Object.keys(group[0].patch).sort().join(',')
      for (const p of group) {
        expect(Object.keys(p.patch).sort().join(','), p.name).toBe(keys)
      }
    }
  })

  // NOT just `ripple`. Every preset number must be reachable by dragging its own
  // slider, or picking the preset puts the form in a state the viewer can never
  // return to -- and the group flips to "Custom" on the next nudge.
  it('every preset value is reachable on its own slider grid', () => {
    const offGrid: string[] = []
    for (const p of waterPresets) {
      for (const [k, v] of Object.entries(p.patch)) {
        const m = readMeta(causticsSchema.shape[k as keyof typeof causticsSchema.shape])!
        if (m.ui !== 'slider' || typeof v !== 'number') continue
        const steps = (v - m.min!) / m.step!
        if (Math.abs(steps - Math.round(steps)) > 1e-9) offGrid.push(`${p.name}.${k}=${v}`)
      }
    }
    expect(offGrid).toEqual([])
  })

  it('every preset patch parses as a whole config', () => {
    for (const p of [...waterPresets, ...palettePresets]) {
      expect(() => causticsSchema.parse({ ...p.patch }), p.name).not.toThrow()
    }
  })

  // NOT an absolute-darkness assertion on `background`. The approved water is a
  // mid-teal (rel. luminance 0.104 -- it would have passed a < 0.25 check), but
  // darkness is not what UX invariant #5 asks for, and a bound on it would forbid
  // a legitimately pale pool. Contrast is the invariant.
  // Measured: Pool 6.74, Deep 8.12, Lagoon 5.63.
  it('the light reads clearly against the water, in every palette', () => {
    const d = causticsSchema.parse({})
    expect(contrast(d.light, d.background)).toBeGreaterThan(3)
    for (const p of palettePresets) {
      expect(contrast(p.patch.light, p.patch.background), p.name).toBeGreaterThan(3)
    }
  })
})
