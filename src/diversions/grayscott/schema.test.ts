import { describe, it, expect } from 'vitest'
import { grayScottSchema } from './schema'

describe('grayScottSchema', () => {
  it('parses to defaults (coral pattern, Deep Coral palette)', () => {
    const cfg = grayScottSchema.parse({})
    expect(cfg.feed).toBeCloseTo(0.0545)
    expect(cfg.kill).toBeCloseTo(0.062)
    expect(cfg.simSpeed).toBe(2)
    expect(cfg.stops.length).toBeGreaterThanOrEqual(2)
  })
  it('every slider field carries min/max meta', () => {
    const shape = grayScottSchema.shape
    for (const key of ['simSpeed', 'feed', 'kill'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('clamps feed/kill to the viable band (rejects dead-zone values)', () => {
    expect(() => grayScottSchema.parse({ feed: 0.5 })).toThrow()
    expect(() => grayScottSchema.parse({ kill: 0.2 })).toThrow()
    expect(grayScottSchema.parse({ feed: 0.014 }).feed).toBeCloseTo(0.014)
  })
})
