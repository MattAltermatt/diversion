import { describe, it, expect } from 'vitest'
import { reiterSnowflakeSchema } from './schema'
import { morphologyPresets, colorPresets } from './presets'

describe('reiterSnowflakeSchema', () => {
  it('parses to defaults (stellar-ish crystal, frost palette)', () => {
    const c = reiterSnowflakeSchema.parse({})
    expect(c.spread).toBeCloseTo(1.0)
    expect(c.humidity).toBeCloseTo(0.5)
    expect(c.detail).toBe(261)
    expect(c.stops.length).toBeGreaterThanOrEqual(2)
  })
  it('every slider field carries min/max meta', () => {
    const shape = reiterSnowflakeSchema.shape
    for (const key of ['spread', 'humidity', 'sharpness', 'speed', 'detail', 'hold'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('seed is randomized on fresh load (seedless share links)', () => {
    expect((reiterSnowflakeSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
  })
  it('detail is an integer within its band', () => {
    expect(() => reiterSnowflakeSchema.parse({ detail: 260.5 })).toThrow()
    expect(reiterSnowflakeSchema.parse({ detail: 401 }).detail).toBe(401)
  })
})

describe('reiter-snowflake presets', () => {
  it('every morphology preset patch parses against the schema', () => {
    for (const p of morphologyPresets) expect(() => reiterSnowflakeSchema.parse(p.patch)).not.toThrow()
  })
  it('every color preset supplies 2..6 valid hex stops', () => {
    for (const p of colorPresets) {
      expect(p.patch.stops.length).toBeGreaterThanOrEqual(2)
      expect(p.patch.stops.length).toBeLessThanOrEqual(6)
      for (const s of p.patch.stops) expect(s).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})
