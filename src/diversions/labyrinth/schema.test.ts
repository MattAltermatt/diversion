import { describe, it, expect } from 'vitest'
import { labyrinthSchema } from './schema'

describe('labyrinthSchema', () => {
  it('parses to defaults', () => {
    const cfg = labyrinthSchema.parse({})
    expect(cfg.mazeSize).toBe(28)
    expect(cfg.agents).toBe(160000)
    expect(cfg.stops.length).toBeGreaterThanOrEqual(2)
    expect(cfg.wallColor).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(cfg.pathColor).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('every slider field carries min/max meta', () => {
    const shape = labyrinthSchema.shape
    for (const key of ['mazeSize', 'sensorAngle', 'sensorDist', 'turnSpeed', 'deposit',
                       'decay', 'diffuse', 'agents', 'speed', 'holdAfterSolve'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })

  it('decay floor is strictly positive (no zero-sink saturation)', () => {
    expect(() => labyrinthSchema.parse({ decay: 0 })).toThrow()
    expect(labyrinthSchema.parse({ decay: 0.005 }).decay).toBe(0.005)
  })
})
