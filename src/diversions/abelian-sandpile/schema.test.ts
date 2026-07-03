import { describe, it, expect } from 'vitest'
import { abelianSandpileSchema } from './schema'
import { arrangementPresets, colorPresets } from './presets'

describe('abelianSandpileSchema', () => {
  it('parses to defaults (single-source mandala, detail 601)', () => {
    const c = abelianSandpileSchema.parse({})
    expect(c.sources).toBe(1)
    expect(c.detail).toBe(601)
    expect(c.speed).toBe(8)
    expect(c.hold).toBe(6)
    expect(c.stops.length).toBe(4)
  })
  it('every slider field carries min/max meta', () => {
    const shape = abelianSandpileSchema.shape
    for (const key of ['speed', 'sources', 'detail', 'hold'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('seed is randomized on fresh load (seedless share links)', () => {
    expect((abelianSandpileSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
  })
  it('sources and detail are integers within their bands', () => {
    expect(() => abelianSandpileSchema.parse({ sources: 2.5 })).toThrow()
    expect(() => abelianSandpileSchema.parse({ detail: 100 })).toThrow() // below min 251
    expect(abelianSandpileSchema.parse({ sources: 6 }).sources).toBe(6)
  })
})

describe('abelian-sandpile presets', () => {
  it('every arrangement preset patch parses against the schema', () => {
    for (const p of arrangementPresets) {
      expect(() => abelianSandpileSchema.parse(p.patch)).not.toThrow()
    }
  })
  it('every color preset supplies 4 valid hex stops', () => {
    for (const p of colorPresets) {
      expect(p.patch.stops.length).toBe(4)
      for (const s of p.patch.stops) expect(s).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})
