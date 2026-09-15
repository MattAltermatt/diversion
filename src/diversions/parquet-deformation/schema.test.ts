import { describe, it, expect } from 'vitest'
import { parquetSchema } from './schema'
import { deformationPresets, palettePresets } from './presets'
import { fields } from '../../framework/fieldMeta'
import { encodeConfig } from '../../framework/urlCodec'

const d = parquetSchema.parse({})

describe('parquet schema', () => {
  it('defaults to the owner-approved organic look', () => {
    expect(d.scheme).toBe('Organic')
    expect(d.amplitude).toBeCloseTo(1.7, 6)
    expect(d.rampMapping).toBe('To the knee')
    expect(d.rampWidth).toBeCloseTo(14, 6)
  })

  it('drifts by default — the piece must not open as a static print', () => {
    expect(d.drift).toBeGreaterThan(0)
  })

  // Segmented renders the option's VALUE, so every segmented enum's values must
  // read as UI labels. "both" or "grid" on a button is the failure this catches.
  it('every segmented option value is presentable text', () => {
    for (const [name, , m] of fields(parquetSchema)) {
      if (m.ui !== 'segmented') continue
      for (const o of (m.options as string[]) ?? []) {
        expect(typeof o, `${name} option must be a plain string`).toBe('string')
        expect(o[0], `${name} option "${o}" must start capitalised`).toBe(o[0].toUpperCase())
      }
    }
  })

  // First schema in the gallery to put a '+' in an enum value, and codecSweep
  // hands the URLSearchParams object straight back to decodeConfig, so
  // toString() is never exercised there.
  it('survives a real URL round trip, including the + in "Fill + line"', () => {
    const qs = encodeConfig(parquetSchema, d).toString()
    expect(qs).toContain('%2B')
    expect(new URLSearchParams(qs).get('renderMode')).toBe('Fill + line')
  })

  it('opens on a NAMED option in both preset groups', () => {
    const dk = Object.keys(deformationPresets[0].patch) as (keyof typeof d)[]
    expect(deformationPresets.some((p) => dk.every((k) => (p.patch as Record<string, unknown>)[k] === d[k]))).toBe(true)
    const ck = Object.keys(palettePresets[0].patch) as (keyof typeof d)[]
    expect(palettePresets.some((p) => ck.every((k) => (p.patch as Record<string, unknown>)[k] === d[k]))).toBe(true)
  })

  it('the whole-stack look stays reachable as a named preset', () => {
    expect(deformationPresets.some((p) => p.patch.rampMapping === 'Whole stack')).toBe(true)
  })
})
