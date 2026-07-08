import { describe, it, expect } from 'vitest'
import { vicsekSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
import { readMeta } from '../../framework/fieldMeta'

describe('vicsek schema', () => {
  it('parses to defaults', () => {
    const cfg = vicsekSchema.parse({})
    expect(cfg.particleCount).toBe(2200)
    expect(cfg.neighborRadius).toBe(24)
    expect(cfg.worldSize).toBe(620)
    expect(cfg.noise).toBeCloseTo(1.1)
    expect(cfg.speed).toBe(60)
  })

  it('every slider field declares min and max (UX invariant 4)', () => {
    for (const [key, field] of Object.entries(vicsekSchema.shape)) {
      const m = readMeta(field as any)
      if (m?.ui === 'slider') {
        expect(m.min, `${key} min`).toBeTypeOf('number')
        expect(m.max, `${key} max`).toBeTypeOf('number')
      }
    }
  })

  it('round-trips through the URL codec (seed is pin-only, not encoded)', () => {
    const cfg = vicsekSchema.parse({ seed: 777, noise: 2.5, particleCount: 500 })
    const decoded = decodeConfig(vicsekSchema, encodeConfig(vicsekSchema, cfg))
    // Every non-seed field round-trips. `seed` is a randomizeOnFreshLoad field, so
    // encode never emits it and decode reverts it to its default.
    expect(decoded).toEqual({ ...cfg, seed: vicsekSchema.parse({}).seed })
  })

  it('noise range spans [0, 2π] — the full Vicsek noise amplitude', () => {
    const noiseField = readMeta(vicsekSchema.shape.noise as any)
    expect(noiseField?.min).toBe(0)
    expect(noiseField?.max).toBeCloseTo(Math.PI * 2)
  })
})
