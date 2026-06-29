import { describe, it, expect } from 'vitest'
import { physarumSchema } from './schema'

describe('physarumSchema', () => {
  it('parses to defaults', () => {
    const cfg = physarumSchema.parse({})
    expect(cfg.agents).toBe(1000000)
    expect(cfg.sensorAngle).toBe(22.5)
    expect(cfg.stops.length).toBeGreaterThanOrEqual(2)
  })
  it('every slider field carries min/max meta', () => {
    const shape = physarumSchema.shape
    for (const key of ['sensorAngle', 'sensorDist', 'turnSpeed', 'decay', 'diffuse', 'agents'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
})
