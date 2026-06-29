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
    for (const key of ['sensorAngle', 'sensorDist', 'turnSpeed', 'depositAmount', 'decay', 'diffuse', 'agents', 'speed'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('decay floor is a small positive value (no zero-sink field saturation)', () => {
    // decay 0 lets the energy-conserving diffuse blur grow the R16F field to its
    // half-float ceiling over a long run — the min must stay strictly positive.
    expect(() => physarumSchema.parse({ decay: 0 })).toThrow()
    expect(physarumSchema.parse({ decay: 0.005 }).decay).toBe(0.005)
  })
})
