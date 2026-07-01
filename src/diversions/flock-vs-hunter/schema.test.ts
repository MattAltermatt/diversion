import { describe, it, expect } from 'vitest'
import { flockVsHunterSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
import { readMeta } from '../../framework/fieldMeta'

describe('flock-vs-hunter schema', () => {
  it('parses to calm defaults', () => {
    const cfg = flockVsHunterSchema.parse({})
    expect(cfg.boidCount).toBe(240)
    expect(cfg.predatorCount).toBe(4)
    expect(cfg.roundLength).toBe(22)
    expect(cfg.speed).toBe(1)
  })

  it('every slider field declares min and max (UX invariant 4)', () => {
    for (const [key, field] of Object.entries(flockVsHunterSchema.shape)) {
      const m = readMeta(field as any)
      if (m?.ui === 'slider') {
        expect(m.min, `${key} min`).toBeTypeOf('number')
        expect(m.max, `${key} max`).toBeTypeOf('number')
      }
    }
  })

  it('round-trips through the URL codec', () => {
    const cfg = flockVsHunterSchema.parse({ seed: 999, boidCount: 180 })
    const decoded = decodeConfig(flockVsHunterSchema, encodeConfig(flockVsHunterSchema, cfg))
    expect(decoded).toEqual(cfg)
  })
})
