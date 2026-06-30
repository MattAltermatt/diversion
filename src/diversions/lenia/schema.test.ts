import { describe, it, expect } from 'vitest'
import { leniaSchema } from './schema'

describe('leniaSchema', () => {
  it('parses to defaults (Coral pattern, Bioluminescence palette)', () => {
    const cfg = leniaSchema.parse({})
    expect(cfg.simSpeed).toBe(1)
    expect(cfg.mu).toBeCloseTo(0.15)
    expect(cfg.sigma).toBeCloseTo(0.017)
    expect(cfg.kernelRadius).toBe(14)
    expect(cfg.kernel).toBe('Smooth')
    expect(cfg.stops.length).toBeGreaterThanOrEqual(2)
  })
  it('every slider field carries min/max meta', () => {
    const shape = leniaSchema.shape
    for (const key of ['simSpeed', 'mu', 'sigma', 'kernelRadius'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('kernel is a segmented enum with both options', () => {
    const m = (leniaSchema.shape.kernel as any).meta()
    expect(m.ui).toBe('segmented')
    expect(m.options).toEqual(['Smooth', 'Layered'])
  })
  it('clamps μ/σ to the viable band (rejects dead-zone values)', () => {
    expect(() => leniaSchema.parse({ mu: 0.9 })).toThrow()
    expect(() => leniaSchema.parse({ sigma: 0.5 })).toThrow()
    expect(leniaSchema.parse({ mu: 0.30 }).mu).toBeCloseTo(0.30)
  })
})
