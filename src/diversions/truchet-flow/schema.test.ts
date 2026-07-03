import { describe, it, expect } from 'vitest'
import { truchetFlowSchema } from './schema'
import { palettePresets } from './presets'

describe('truchetFlowSchema', () => {
  it('parses to defaults (circuit look, animated flow)', () => {
    const c = truchetFlowSchema.parse({})
    expect(c.tileSize).toBe(60)
    expect(c.lineWidth).toBe(6)
    expect(c.flowSpeed).toBeCloseTo(0.6)
    expect(c.flowSpeed).toBeGreaterThan(0) // MUST animate by default
    expect(c.flow).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
  it('every slider field carries min/max meta', () => {
    const shape = truchetFlowSchema.shape
    for (const key of ['tileSize', 'lineWidth', 'flowSpeed', 'glow'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('seed is randomized on fresh load (seedless share links)', () => {
    expect((truchetFlowSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
  })
  it('tileSize is an integer within its band', () => {
    expect(() => truchetFlowSchema.parse({ tileSize: 60.5 })).toThrow()
    expect(truchetFlowSchema.parse({ tileSize: 140 }).tileSize).toBe(140)
  })
})

describe('truchet-flow presets', () => {
  it('every palette preset patch parses against the schema', () => {
    for (const p of palettePresets) expect(() => truchetFlowSchema.parse(p.patch)).not.toThrow()
  })
})
