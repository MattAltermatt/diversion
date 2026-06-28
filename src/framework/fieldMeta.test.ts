import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { fields } from './fieldMeta'

const schema = z.object({
  particles: z
    .number()
    .int()
    .min(100)
    .max(20000)
    .default(4000)
    .meta({ ui: 'slider', min: 100, max: 20000, step: 100, label: 'Particles' }),
  seed: z.number().int().default(1).meta({ ui: 'number', label: 'Seed' }),
})

describe('fields', () => {
  it('returns ordered fields with their meta', () => {
    const f = fields(schema)
    expect(f.map(([k]) => k)).toEqual(['particles', 'seed'])
    expect(f[0][2].ui).toBe('slider')
    expect(f[0][2].max).toBe(20000)
    expect(f[1][2].ui).toBe('number')
  })

  it('throws if a field has no meta', () => {
    const bad = z.object({ x: z.number().default(0) })
    expect(() => fields(bad)).toThrow(/missing .meta/)
  })

  it("accepts ui:'hidden' (URL-encoded, non-rendered field)", () => {
    const s = z.object({
      rule: z.enum(['RL', 'LLRR']).default('RL').meta({ ui: 'hidden', label: 'Rule' }),
    })
    const f = fields(s)
    expect(f[0][2].ui).toBe('hidden')
    expect(f[0][2].label).toBe('Rule')
  })
})
