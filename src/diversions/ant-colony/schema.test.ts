import { describe, it, expect } from 'vitest'
import { antColonySchema } from './schema'

describe('antColonySchema', () => {
  it('parses to defaults', () => {
    const cfg = antColonySchema.parse({})
    expect(cfg.gridResolution).toBe(140)
    expect(cfg.colonies).toBe('1')
    expect(cfg.antCount).toBe(800)
    expect(cfg.foodSources).toBe(4)
  })

  it('every slider field carries min/max meta', () => {
    const shape = antColonySchema.shape
    for (const key of [
      'gridResolution', 'foodSources', 'antCount', 'antSpeed', 'sensorAngle',
      'sensorDistance', 'turnSpeed', 'jitter', 'homingBias', 'evaporation',
      'diffusion', 'depositAmount', 'simSpeed',
    ] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })

  it('colonies is a segmented 1/2 choice', () => {
    const m = (antColonySchema.shape.colonies as any).meta()
    expect(m.ui).toBe('segmented')
    expect(m.options).toEqual(['1', '2'])
    expect(antColonySchema.parse({ colonies: '2' }).colonies).toBe('2')
  })

  it('evaporation floor is a small positive value (no zero-sink field saturation)', () => {
    expect(() => antColonySchema.parse({ evaporation: 0 })).toThrow()
    expect(antColonySchema.parse({ evaporation: 0.003 }).evaporation).toBe(0.003)
  })
})
